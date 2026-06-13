"""
Arduino UNO connection manager.

Singleton process-wide. Wraps pyfirmata2 with a simple pin-cache so callers
just say `write_digital(13, True)` without thinking about pin objects or
modes. Disconnect tears down the board and clears state.

Phoenix Flow is single-user desktop, so one Arduino at a time is enough; if we
ever need multiple boards we'd swap this for a dict keyed by port.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Literal

import serial.tools.list_ports

log = logging.getLogger(__name__)


PinMode = Literal["digital_in", "digital_out", "pwm", "servo", "analog_in"]


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


class ArduinoManager:
    """Singleton-style holder around a single pyfirmata2.Arduino instance."""

    def __init__(self) -> None:
        self._board = None  # pyfirmata2.Arduino | None
        self._port: str | None = None
        self._pins: dict[int, object] = {}        # pin_number → pyfirmata Pin
        self._modes: dict[int, PinMode] = {}      # pin_number → mode it's in
        self._analog_sample_rate_ms = 50          # 20 Hz default; configurable later
        self._lock = threading.RLock()

    # ── Connection ────────────────────────────────────────────────────────────
    @property
    def is_connected(self) -> bool:
        return self._board is not None

    def status(self) -> Status:
        with self._lock:
            return Status(
                connected=self.is_connected,
                port=self._port,
                firmware_name=getattr(self._board, "firmware", None) if self._board else None,
                firmware_version=getattr(self._board, "firmware_version", None) if self._board else None,
                pin_modes=dict(self._modes),
            )

    def connect(self, port: str) -> Status:
        """Open the given serial port. Raises on failure (caller maps to HTTP 400)."""
        with self._lock:
            if self._board is not None:
                if self._port == port:
                    return self.status()
                self._teardown()

            # Lazy import — pyfirmata2 pulls in serial at import time, and we don't
            # want a missing dep on a dev box to crash the whole API import.
            import pyfirmata2  # type: ignore

            log.info("[arduino] connecting on %s ...", port)
            try:
                board = pyfirmata2.Arduino(port)
            except Exception as e:
                raise RuntimeError(f"failed to open {port}: {e}") from e

            # Background sampling thread for analog reads.
            try:
                board.samplingOn(self._analog_sample_rate_ms)
            except Exception:
                # Older pyfirmata uses .iterator instead.
                from pyfirmata2 import util  # type: ignore
                it = util.Iterator(board)
                it.start()

            self._board = board
            self._port = port
            self._pins.clear()
            self._modes.clear()
            log.info("[arduino] connected on %s", port)
            return self.status()

    def disconnect(self) -> None:
        with self._lock:
            self._teardown()

    def _teardown(self) -> None:
        if self._board is not None:
            try:
                self._board.exit()
            except Exception:
                log.exception("[arduino] error during board.exit()")
        self._board = None
        self._port = None
        self._pins.clear()
        self._modes.clear()

    # ── Pin setup ─────────────────────────────────────────────────────────────
    def _ensure_board(self):
        if self._board is None:
            raise RuntimeError("Arduino not connected")
        return self._board

    def _get_pin(self, pin: int, mode: PinMode):
        """Return a pyfirmata Pin object for `pin` in the requested mode.

        Switching modes on the same pin re-creates the Pin object — pyfirmata
        doesn't track this for us so we wipe our cache too.
        """
        with self._lock:
            existing = self._modes.get(pin)
            if existing == mode and pin in self._pins:
                return self._pins[pin]

            board = self._ensure_board()
            spec = {
                "digital_in":  f"d:{pin}:i",
                "digital_out": f"d:{pin}:o",
                "pwm":         f"d:{pin}:p",
                "servo":       f"d:{pin}:s",
                "analog_in":   f"a:{pin}:i",
            }[mode]
            p = board.get_pin(spec)
            if mode == "analog_in":
                p.enable_reporting()
            self._pins[pin] = p
            self._modes[pin] = mode
            return p

    # ── Writes (AI → board) ───────────────────────────────────────────────────
    def write_digital(self, pin: int, value: bool) -> None:
        p = self._get_pin(pin, "digital_out")
        p.write(1 if value else 0)

    def write_pwm(self, pin: int, value: float) -> None:
        """`value` is 0.0 .. 1.0 (pyfirmata expects normalised duty cycle)."""
        v = max(0.0, min(1.0, float(value)))
        p = self._get_pin(pin, "pwm")
        p.write(v)

    def write_servo(self, pin: int, angle: float) -> None:
        """`angle` is 0..180 degrees."""
        a = max(0.0, min(180.0, float(angle)))
        p = self._get_pin(pin, "servo")
        p.write(a)

    # ── Reads (sensor → AI) ───────────────────────────────────────────────────
    def read_digital(self, pin: int) -> bool | None:
        p = self._get_pin(pin, "digital_in")
        # pyfirmata's read() returns None until first sample arrives.
        v = p.read()
        return None if v is None else bool(v)

    def read_analog(self, pin: int) -> int | None:
        """Returns 0..1023 (we expose Arduino-style ints, not the 0..1 float)."""
        p = self._get_pin(pin, "analog_in")
        v = p.read()
        return None if v is None else int(round(v * 1023))


# Process-wide singleton.
_manager: ArduinoManager | None = None
_singleton_lock = threading.Lock()


def get_manager() -> ArduinoManager:
    global _manager
    with _singleton_lock:
        if _manager is None:
            _manager = ArduinoManager()
        return _manager
