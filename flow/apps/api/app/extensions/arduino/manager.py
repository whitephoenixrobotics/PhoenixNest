"""
Arduino UNO connection manager.

Singleton process-wide. Wraps pyfirmata2 with a simple pin-cache so callers
just say `write_digital(13, True)` without thinking about pin objects or
modes. Disconnect tears down the board and clears state.

Phoenix Flow is single-user desktop, so one Arduino at a time is enough; if we
ever need multiple boards we'd swap this for a dict keyed by port.

── Threading model (why this file looks the way it does) ──────────────────────
Every byte to/from the board goes through ONE dedicated worker thread that
exclusively owns the pyfirmata2.Arduino object (the `_SerialWorker` below).
Callers never touch the board directly: they push a command onto a thread-safe
queue and get back a `concurrent.futures.Future`. Async handlers wrap that with
`asyncio.wrap_future` so they can `await` it without blocking the event loop
*and without using the shared default ThreadPoolExecutor* (which would get
drained by Auto-Run's flood of writes and freeze the whole API).

Because there is exactly one owner thread, board access is serialised by
construction — no RLock, no lock convoy, no interleaved Firmata frames.

Two more properties this buys us:
  • Write coalescing — under rapid Auto-Run ticks only the LATEST value per
    (pin, op) matters, so we drop stale queued writes. No backlog can build up
    and "drain-flicker" the LED, and the wire never falls behind.
  • Lock-independent disconnect — disconnect force-closes the underlying
    pyserial handle from the *caller's* thread (CancelIoEx on Windows), which
    interrupts any in-flight blocking read/write on the worker. The worker then
    drains and exits; we join with a timeout and mark disconnected regardless.
    A wedged board can never make Disconnect hang.
"""
from __future__ import annotations

import asyncio
import logging
import queue
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

import serial.tools.list_ports

log = logging.getLogger(__name__)


PinMode = Literal["digital_in", "digital_out", "pwm", "servo", "analog_in"]

# Finite serial timeouts so no single board call can wedge the worker forever.
# pyfirmata2 opens with timeout=None (blocking, no deadline) — we override on
# board.sp right after construction. With these set, a stalled write raises
# SerialTimeoutException (worker recovers) and the Iterator's read() returns
# b'' and re-checks `running` (so its join() can actually complete).
_READ_TIMEOUT_S = 0.2
_WRITE_TIMEOUT_S = 1.0

# How long disconnect waits for the worker to exit after we force-close the
# port. The port is already closed by then, so even if we give up the OS has
# released the COM handle and a fresh connect works.
_WORKER_JOIN_TIMEOUT_S = 2.0

# Upper bound on how long an async handler awaits a board call before giving up.
# The worker normally resolves far sooner (write_timeout is 1s; reads are
# instant cached lookups) and _fail_pending() resolves anything left when the
# worker stops — these are a final guard so a request coroutine can never hang.
_WRITE_CALL_TIMEOUT_S = 5.0
_READ_CALL_TIMEOUT_S = 3.0


@dataclass
class PortInfo:
    device: str           # "COM3"
    description: str      # "Arduino Uno (COM3)"
    vid: int | None
    pid: int | None
    likely_arduino: bool  # heuristic on VID/PID + description


@dataclass
class Status:
    connected: bool
    port: str | None
    firmware_name: str | None = None
    firmware_version: tuple[int, int] | None = None
    pin_modes: dict[int, PinMode] = field(default_factory=dict)


# Known USB VID/PID pairs for Arduino UNO and common clones.
# (Genuine UNO + CH340/CH341 clones cover ~99% of boards in the wild.)
_ARDUINO_VIDS = {
    0x2341,  # Arduino LLC
    0x2A03,  # Arduino SRL (older)
    0x1A86,  # WCH (CH340/CH341 clones — most cheap UNOs)
    0x10C4,  # Silicon Labs CP210x (some clones)
}


def list_ports() -> list[PortInfo]:
    """Enumerate serial ports with an Arduino-likely heuristic."""
    out: list[PortInfo] = []
    for p in serial.tools.list_ports.comports():
        desc = (p.description or "").lower()
        likely = (
            (p.vid in _ARDUINO_VIDS if p.vid is not None else False)
            or "arduino" in desc
            or "ch340" in desc
            or "ch341" in desc
            or "cp210" in desc
        )
        out.append(PortInfo(
            device=p.device,
            description=p.description or p.device,
            vid=p.vid,
            pid=p.pid,
            likely_arduino=likely,
        ))
    # Likely-arduino ports first so the UI can default-select sensibly.
    out.sort(key=lambda p: (not p.likely_arduino, p.device))
    return out


# ── Command objects pushed onto the worker's queue ─────────────────────────────
class _Stop:
    """Sentinel: tells the worker loop to exit."""
    __slots__ = ()


@dataclass
class _Cmd:
    """A unit of board work to run on the worker thread.

    `coalesce_key` lets the worker drop stale writes: if a newer command with
    the same key is already queued, the older one's future is resolved with the
    newer value's result is *not* needed — we simply skip the stale call. We
    keep the LATEST per key (see _SerialWorker._coalesce).
    """
    fn: Callable[["_SerialWorker"], Any]
    future: Future
    coalesce_key: tuple | None = None


class _SerialWorker(threading.Thread):
    """The single thread that owns the pyfirmata2 board.

    It is the ONLY thing that ever calls board.get_pin / pin.write / pin.read /
    board.samplingOn / board.exit. Everything else hands it a `_Cmd`.
    """

    def __init__(self, port: str) -> None:
        super().__init__(name=f"arduino-serial-{port}", daemon=True)
        self._port = port
        self._q: "queue.Queue[_Cmd | _Stop]" = queue.Queue()
        self._board = None          # pyfirmata2.Arduino — touched ONLY on this thread
        self._sp = None             # serial.Serial handle — captured for force-close
        self._pins: dict[tuple[int, PinMode], object] = {}  # (pin, mode) → pyfirmata Pin
        self._last_write: dict[int, float] = {}             # pin → last value sent
        self._sampling_on = False   # did we start the Iterator yet?
        self._analog_sample_rate_ms = 50
        self._stopping = threading.Event()
        # Latest queued command per coalesce key — used to skip stale writes.
        self._coalesced: dict[tuple, _Cmd] = {}
        self._coalesce_lock = threading.Lock()
        # connect() result is delivered through this future.
        self._ready: Future = Future()
        self._firmware: str | None = None
        self._firmware_version: tuple[int, int] | None = None
        self._lost = False          # set if the wire died under us (unplug)

    # ── public (called from other threads) ──────────────────────────────────
    @property
    def sp(self):
        return self._sp

    @property
    def ready(self) -> Future:
        return self._ready

    @property
    def lost(self) -> bool:
        return self._lost

    def firmware(self) -> tuple[str | None, tuple[int, int] | None]:
        return self._firmware, self._firmware_version

    def submit(self, fn: Callable[["_SerialWorker"], Any],
               coalesce_key: tuple | None = None) -> Future:
        """Enqueue work for the worker thread; returns a Future for the result.

        If `coalesce_key` is given and a command with the same key is already
        pending, the OLDER one is marked superseded (its future resolves to
        None) so only the latest value reaches the wire. This is what stops an
        Auto-Run write backlog from building up.
        """
        fut: Future = Future()
        if self._stopping.is_set():
            fut.set_exception(RuntimeError("Arduino worker stopped"))
            return fut
        cmd = _Cmd(fn=fn, future=fut, coalesce_key=coalesce_key)
        if coalesce_key is not None:
            with self._coalesce_lock:
                stale = self._coalesced.get(coalesce_key)
                if stale is not None and not stale.future.done():
                    # Supersede the older queued write — resolve it as a no-op.
                    stale.future.set_result(None)
                    stale.fn = _noop  # neutralise it if the worker already popped it
                self._coalesced[coalesce_key] = cmd
        self._q.put(cmd)
        return fut

    def force_close(self) -> None:
        """Interrupt any in-flight blocking serial I/O from the CALLER's thread.

        This is the load-bearing recovery primitive: closing the handle makes a
        blocked sp.read()/sp.write() on the worker raise immediately (CancelIoEx
        on Windows / EBADF on posix), which is exactly what the worker loop and
        pyfirmata2's Iterator are built to catch (util.py:55-58). Must NOT touch
        the board object or any worker-owned state — only the raw handle.
        """
        sp = self._sp
        if sp is None:
            return
        for meth in ("cancel_read", "cancel_write"):
            try:
                getattr(sp, meth)()
            except Exception:
                pass
        try:
            sp.close()
        except Exception:
            pass

    def stop(self) -> None:
        self._stopping.set()
        try:
            self._q.put_nowait(_Stop())
        except Exception:
            pass

    def _fail_pending(self) -> None:
        """Resolve every still-queued/coalesced command's future after the loop
        exits, so an awaiting handler can never hang on a worker that stopped
        (unplug, disconnect, or a fatal serial error) with work still in flight."""
        while True:
            try:
                item = self._q.get_nowait()
            except queue.Empty:
                break
            if isinstance(item, _Cmd) and not item.future.done():
                item.future.set_exception(RuntimeError("Arduino worker stopped"))
        with self._coalesce_lock:
            for cmd in self._coalesced.values():
                if not cmd.future.done():
                    cmd.future.set_exception(RuntimeError("Arduino worker stopped"))
            self._coalesced.clear()

    # ── worker-thread internals ──────────────────────────────────────────────
    def run(self) -> None:
        try:
            self._open()
        except Exception as e:  # noqa: BLE001
            if not self._ready.done():
                self._ready.set_exception(e)
            return
        if not self._ready.done():
            self._ready.set_result(True)

        while not self._stopping.is_set():
            try:
                item = self._q.get(timeout=0.25)
            except queue.Empty:
                continue
            if isinstance(item, _Stop):
                break
            self._run_cmd(item)

        self._teardown_on_worker()
        # Resolve anything still queued so no awaiting handler hangs forever.
        self._fail_pending()

    def _run_cmd(self, cmd: _Cmd) -> None:
        # If this command was the latest for its key, clear the slot so future
        # writes to the same pin aren't considered "superseded" by a done cmd.
        if cmd.coalesce_key is not None:
            with self._coalesce_lock:
                if self._coalesced.get(cmd.coalesce_key) is cmd:
                    self._coalesced.pop(cmd.coalesce_key, None)
        if cmd.future.done():  # superseded by a newer coalesced write
            return
        try:
            result = cmd.fn(self)
            if not cmd.future.done():
                cmd.future.set_result(result)
        except serial.SerialException as e:
            # The wire died (unplug / wedged handle) or a write timed out. Flip
            # to lost and bail — disconnect()/status() see _lost and clean up.
            # A plain OSError/IOError from a logic slip (e.g. a bad pin mode) is
            # NOT a dead wire; it falls through to the generic arm and is just
            # reported on that one command without tearing the board down.
            self._lost = True
            log.warning("[arduino] serial error on worker, marking lost: %s", e)
            if not cmd.future.done():
                cmd.future.set_exception(e)
            self._stopping.set()
        except Exception as e:  # noqa: BLE001
            if not cmd.future.done():
                cmd.future.set_exception(e)

    def _open(self) -> None:
        # Lazy import — pyfirmata2 pulls in serial at import time, and we don't
        # want a missing dep on a dev box to crash the whole API import.
        import pyfirmata2  # type: ignore

        log.info("[arduino] connecting on %s ...", self._port)
        # On a reconnect, a just-abandoned previous worker may still hold the
        # COM handle for a moment → Windows raises "Access is denied". Back off
        # and retry a couple of times before giving up. Each Arduino() blocks
        # ~5s for the board's auto-reset.
        board = None
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                board = pyfirmata2.Arduino(self._port)
                break
            except serial.SerialException as e:
                last_err = e
                log.warning("[arduino] open %s failed (attempt %d/3): %s",
                            self._port, attempt + 1, e)
                # Only "Access is denied" is transient (a just-abandoned worker
                # still holding the handle on reconnect) — back off and retry.
                # A missing port won't appear by retrying, so bail immediately.
                if "access is denied" not in str(e).lower() and "permission" not in str(e).lower():
                    break
                time.sleep(0.5)
        if board is None:
            raise last_err or RuntimeError(f"could not open {self._port}")

        # Override pyfirmata2's timeout=None so neither reads nor writes can
        # block forever. Done on board.sp directly since Arduino() builds it.
        try:
            board.sp.timeout = _READ_TIMEOUT_S
            board.sp.write_timeout = _WRITE_TIMEOUT_S
        except Exception:  # noqa: BLE001
            log.exception("[arduino] could not set serial timeouts")

        self._board = board
        self._sp = board.sp
        self._firmware = getattr(board, "firmware", None)
        self._firmware_version = getattr(board, "firmware_version", None)
        # NOTE: we deliberately do NOT call samplingOn() here. The Iterator
        # thread is only needed to drain incoming reports; a write-only flow
        # (Switch → Digital Write) never needs it, and not running it removes
        # the read-vs-write race on the shared handle entirely. We start it
        # lazily the first time a read pin is registered (_ensure_sampling).
        log.info("[arduino] connected on %s", self._port)

    def _ensure_sampling(self) -> None:
        """Start the Iterator/sampling thread on first read use only.

        pyfirmata2's Iterator (board.samplerThread) is what drains incoming
        Firmata reports into pin.value — without it, reads never update. A
        write-only flow never needs it, so we start it lazily (and keep the
        read-vs-write race off the wire until a read is actually requested).
        """
        if self._sampling_on or self._board is None:
            return
        self._board.samplingOn(self._analog_sample_rate_ms)
        self._sampling_on = True

    def _get_pin(self, pin: int, mode: PinMode):
        key = (pin, mode)
        cached = self._pins.get(key)
        if cached is not None:
            return cached
        # Switching a pin to a new mode invalidates the old Pin object and any
        # cached last-write for it.
        for (p, m) in list(self._pins.keys()):
            if p == pin and m != mode:
                self._pins.pop((p, m), None)
                self._last_write.pop(pin, None)
        spec = {
            "digital_in":  f"d:{pin}:i",
            "digital_out": f"d:{pin}:o",
            "pwm":         f"d:{pin}:p",
            "servo":       f"d:{pin}:s",
            "analog_in":   f"a:{pin}:i",
        }[mode]
        p = self._board.get_pin(spec)
        if mode in ("digital_in", "analog_in"):
            # Reads require the firmware to stream reports → start the Iterator.
            self._ensure_sampling()
            if mode == "analog_in":
                p.enable_reporting()
        self._pins[key] = p
        return p

    # The actual board operations — all run ON the worker thread. ────────────
    def _do_write_digital(self, pin: int, value: bool):
        target = 1.0 if value else 0.0
        if self._last_write.get(pin) == target:
            return
        self._get_pin(pin, "digital_out").write(int(target))
        self._last_write[pin] = target

    def _do_write_pwm(self, pin: int, value: float):
        v = max(0.0, min(1.0, float(value)))
        if self._last_write.get(pin) == v:
            return
        self._get_pin(pin, "pwm").write(v)
        self._last_write[pin] = v

    def _do_write_servo(self, pin: int, angle: float):
        a = max(0.0, min(180.0, float(angle)))
        if self._last_write.get(pin) == a:
            return
        self._get_pin(pin, "servo").write(a)
        self._last_write[pin] = a

    def _assert_sampler_alive(self) -> None:
        """Reads rely on the Iterator (sampler) thread draining reports into
        pin.value. If it has died (e.g. the board was unplugged), surface it as
        a serial error so the worker is marked lost and the UI flips to
        disconnected instead of streaming stale values forever."""
        b = self._board
        if self._sampling_on and b is not None:
            t = getattr(b, "samplerThread", None)
            if t is not None and not t.is_alive():
                raise serial.SerialException("Arduino read thread stopped (board unplugged?)")

    def _do_read_digital(self, pin: int):
        # This pyfirmata2 fork is callback-only: Pin.read() RAISES for input
        # pins. The Iterator thread populates pin.value via Port._update — read
        # that cached value instead (atomic single-attribute read under CPython).
        p = self._get_pin(pin, "digital_in")
        self._assert_sampler_alive()
        v = p.value
        return None if v is None else bool(v)

    def _do_read_analog(self, pin: int):
        # pin.value is the 0..1 float set by _handle_analog_message on the
        # Iterator thread (None until the first report arrives after sampling).
        p = self._get_pin(pin, "analog_in")
        self._assert_sampler_alive()
        v = p.value
        return None if v is None else int(round(v * 1023))

    def _do_pin_modes(self) -> dict[int, PinMode]:
        return {pin: mode for (pin, mode) in self._pins.keys()}

    def _teardown_on_worker(self) -> None:
        """Release the board and — critically — the OS serial handle.

        Two paths reach here:
          • clean disconnect: the port is healthy; board.exit() disables
            reporting, detaches servos, and closes the handle gracefully.
          • lost wire (unplug / wedge): board.exit() would try to WRITE
            disable-reporting bytes to a dead port — each blocks up to
            write_timeout and then raises *before* exit() reaches its own
            sp.close(), LEAKING the COM handle. The next connect() then gets
            "Access is denied" against a port nothing appears to hold. So when
            we're lost we skip the graceful exit and close the raw handle
            directly. Either way the handle is guaranteed closed below.
        """
        board, self._board = self._board, None
        sp = self._sp
        if board is not None and not self._lost:
            try:
                board.exit()
            except Exception:
                log.debug("[arduino] board.exit() during teardown raised (expected if force-closed)")
        # The load-bearing release of the COM port — idempotent, and the ONLY
        # close we can rely on when board.exit() bailed early. Closing sp also
        # makes pyfirmata2's Iterator thread raise→break, so it self-terminates.
        if sp is not None:
            try:
                sp.close()
            except Exception:
                pass
        self._pins.clear()
        self._last_write.clear()
        self._sp = None
        self._sampling_on = False


def _noop(_w: _SerialWorker):
    return None


class ArduinoManager:
    """Singleton-style holder around a single _SerialWorker (one board)."""

    def __init__(self) -> None:
        self._worker: _SerialWorker | None = None
        self._port: str | None = None
        # Guards connect/disconnect lifecycle transitions only — NOT serial I/O.
        # Held briefly, never around a blocking board call, so it can't convoy.
        self._lifecycle = threading.Lock()

    # ── Connection ────────────────────────────────────────────────────────────
    @property
    def is_connected(self) -> bool:
        w = self._worker
        return w is not None and w.is_alive() and not w.lost

    def status(self) -> Status:
        w = self._worker
        if w is None or not self.is_connected:
            # A lost/dead worker is reported as disconnected and reaped so a
            # replug + reconnect on the same COM port works without a restart.
            if w is not None and (w.lost or not w.is_alive()):
                self._reap_dead_worker()
            return Status(connected=False, port=None)
        fw_name, fw_ver = w.firmware()
        modes: dict[int, PinMode] = {}
        try:
            modes = w.submit(_SerialWorker._do_pin_modes).result(timeout=0.5)
        except Exception:  # noqa: BLE001
            pass
        return Status(
            connected=True,
            port=self._port,
            firmware_name=fw_name,
            firmware_version=fw_ver,
            pin_modes=modes,
        )

    def _reap_dead_worker(self) -> None:
        with self._lifecycle:
            w = self._worker
            if w is not None and (w.lost or not w.is_alive()):
                try:
                    w.force_close()
                    w.stop()
                except Exception:  # noqa: BLE001
                    pass
                self._worker = None
                self._port = None

    def connect(self, port: str) -> Status:
        """Open the given serial port. Raises on failure (caller maps to HTTP 400)."""
        with self._lifecycle:
            if self.is_connected and self._port == port:
                w = self._worker
                fw_name, fw_ver = w.firmware()  # type: ignore[union-attr]
                return Status(connected=True, port=self._port,
                              firmware_name=fw_name, firmware_version=fw_ver)
            # Replacing an existing (or dead) board — tear it down first.
            self._teardown_locked()

            worker = _SerialWorker(port)
            worker.start()
            try:
                worker.ready.result(timeout=15.0)  # wait for open()/handshake
            except Exception as e:
                worker.force_close()
                worker.stop()
                raise RuntimeError(f"failed to open {port}: {e}") from e

            self._worker = worker
            self._port = port
            fw_name, fw_ver = worker.firmware()
            return Status(connected=True, port=port,
                          firmware_name=fw_name, firmware_version=fw_ver)

    def disconnect(self) -> None:
        """Immediate, reliable disconnect — safe even if a write is wedged.

        Force-closes the serial handle from THIS thread (interrupts any blocked
        read/write on the worker), signals the worker to stop, joins with a
        timeout, then drops state regardless of whether the worker exited.
        """
        with self._lifecycle:
            self._teardown_locked()

    def _teardown_locked(self) -> None:
        w = self._worker
        if w is None:
            self._port = None
            return
        # 1) Break any in-flight blocking I/O so the worker can't stay wedged.
        try:
            w.force_close()
        except Exception:  # noqa: BLE001
            log.exception("[arduino] force_close during teardown")
        # 2) Tell the worker to exit and wait briefly. The port is already
        #    closed, so even a truly-wedged daemon thread we abandon has
        #    released the COM handle.
        w.stop()
        w.join(timeout=_WORKER_JOIN_TIMEOUT_S)
        if w.is_alive():
            log.warning("[arduino] worker did not exit within %ss; abandoning "
                        "daemon thread (port already closed)", _WORKER_JOIN_TIMEOUT_S)
        self._worker = None
        self._port = None

    # ── Sync I/O (callable from any thread; blocks the caller, not the loop) ──
    # These are kept for the live-read code and any non-async caller. Async
    # handlers should prefer the a* variants below so the event loop never
    # blocks. Each submits to the worker and waits on the Future.
    def write_digital(self, pin: int, value: bool) -> None:
        self._submit_write(_SerialWorker._do_write_digital, pin, value).result()

    def write_pwm(self, pin: int, value: float) -> None:
        self._submit_write(_SerialWorker._do_write_pwm, pin, value).result()

    def write_servo(self, pin: int, angle: float) -> None:
        self._submit_write(_SerialWorker._do_write_servo, pin, angle).result()

    def read_digital(self, pin: int) -> bool | None:
        return self._submit_read(_SerialWorker._do_read_digital, pin).result(timeout=2.0)

    def read_analog(self, pin: int) -> int | None:
        return self._submit_read(_SerialWorker._do_read_analog, pin).result(timeout=2.0)

    # ── Async I/O (await without blocking the loop or the default pool) ───────
    async def awrite_digital(self, pin: int, value: bool) -> None:
        await asyncio.wait_for(
            asyncio.wrap_future(self._submit_write(_SerialWorker._do_write_digital, pin, value)),
            timeout=_WRITE_CALL_TIMEOUT_S)

    async def awrite_pwm(self, pin: int, value: float) -> None:
        await asyncio.wait_for(
            asyncio.wrap_future(self._submit_write(_SerialWorker._do_write_pwm, pin, value)),
            timeout=_WRITE_CALL_TIMEOUT_S)

    async def awrite_servo(self, pin: int, angle: float) -> None:
        await asyncio.wait_for(
            asyncio.wrap_future(self._submit_write(_SerialWorker._do_write_servo, pin, angle)),
            timeout=_WRITE_CALL_TIMEOUT_S)

    async def aread_digital(self, pin: int) -> bool | None:
        return await asyncio.wait_for(
            asyncio.wrap_future(self._submit_read(_SerialWorker._do_read_digital, pin)),
            timeout=_READ_CALL_TIMEOUT_S)

    async def aread_analog(self, pin: int) -> int | None:
        return await asyncio.wait_for(
            asyncio.wrap_future(self._submit_read(_SerialWorker._do_read_analog, pin)),
            timeout=_READ_CALL_TIMEOUT_S)

    async def astatus(self) -> Status:
        return await asyncio.to_thread(self.status)  # status() is cheap & bounded

    # ── submit helpers ────────────────────────────────────────────────────────
    def _require_worker(self) -> _SerialWorker:
        w = self._worker
        if w is None or not self.is_connected:
            raise RuntimeError("Arduino not connected")
        return w

    def _submit_write(self, do_fn, pin: int, value) -> Future:
        w = self._require_worker()
        # Coalesce on (op, pin): rapid Auto-Run ticks collapse to the latest
        # value so no backlog can build up. The bound method `do_fn` identifies
        # the op; pin disambiguates per-pin.
        return w.submit(lambda wk: do_fn(wk, pin, value),
                        coalesce_key=(do_fn, pin))

    def _submit_read(self, do_fn, pin: int) -> Future:
        w = self._require_worker()
        # Reads are instant cached-value lookups (no serial I/O), so they never
        # back up — do NOT coalesce. Coalescing could resolve an already-awaited
        # read to None when superseded, injecting spurious zeros into the live
        # stream (e.g. the /ws/arduino/pin loop).
        return w.submit(lambda wk: do_fn(wk, pin))


# Process-wide singleton.
_manager: ArduinoManager | None = None
_singleton_lock = threading.Lock()


def get_manager() -> ArduinoManager:
    global _manager
    with _singleton_lock:
        if _manager is None:
            _manager = ArduinoManager()
        return _manager
