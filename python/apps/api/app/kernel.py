"""Manager for persistent per-project kernels (see kernel_runner.py)."""

import json
import os
import subprocess
import threading
import time
from pathlib import Path

_RUNNER = str(Path(__file__).resolve().parent / "kernel_runner.py")


class ExecResult(dict):
    pass


class Kernel:
    """A single long-lived kernel subprocess. Executions are serialized."""

    def __init__(self, interpreter: str, cwd: str):
        self._cwd = cwd
        self._lock = threading.Lock()
        self.exec_count = 0
        env = os.environ.copy()
        # Force matplotlib's non-interactive backend so plt.plot()/show() works
        # headless; we capture figures as inline PNGs ourselves.
        env["MPLBACKEND"] = "Agg"
        self.proc = subprocess.Popen(
            [interpreter, "-I", "-X", "utf8", "-u", _RUNNER],
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            bufsize=1,
            env=env,
        )

    def alive(self) -> bool:
        return self.proc.poll() is None

    def introspect(self) -> list[dict]:
        """Ask the kernel for its user-defined variables. Non-blocking: returns
        [] if the kernel is busy (e.g. mid interactive input) so callers on the
        event loop never stall waiting for the lock."""
        if not self._lock.acquire(blocking=False):
            return []
        try:
            try:
                self.proc.stdin.write(json.dumps({"introspect": True}) + "\n")
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError):
                return []
            line = _readline_timeout(self.proc.stdout, 5)
            if not line:
                return []
            try:
                return json.loads(line).get("vars", [])
            except json.JSONDecodeError:
                return []
        finally:
            self._lock.release()

    def complete(self, code: str, line: int, column: int) -> list[dict]:
        if not self._lock.acquire(blocking=False):
            return []  # busy → no completion right now
        try:
            try:
                self.proc.stdin.write(
                    json.dumps(
                        {"complete": True, "code": code, "line": line, "column": column}
                    )
                    + "\n"
                )
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError):
                return []
            resp = _readline_timeout(self.proc.stdout, 5)
            if not resp:
                return []
            try:
                return json.loads(resp).get("completions", [])
            except json.JSONDecodeError:
                return []
        finally:
            self._lock.release()

    def names(self) -> list[str]:
        if not self._lock.acquire(blocking=False):
            return []  # busy (e.g. awaiting interactive input) → skip
        try:
            try:
                self.proc.stdin.write(json.dumps({"names": True}) + "\n")
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError):
                return []
            resp = _readline_timeout(self.proc.stdout, 5)
            if not resp:
                return []
            try:
                return json.loads(resp).get("names", [])
            except json.JSONDecodeError:
                return []
        finally:
            self._lock.release()

    def execute(self, code: str, timeout: float, stdin: str = "") -> dict:
        with self._lock:
            self.exec_count += 1
            count = self.exec_count
            start = time.perf_counter()
            try:
                self.proc.stdin.write(
                    json.dumps({"code": code, "stdin": stdin}) + "\n"
                )
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError):
                self.kill()
                return _dead(count)

            line = _readline_timeout(self.proc.stdout, timeout)
            duration_ms = int((time.perf_counter() - start) * 1000)
            if line is None:
                # Cell exceeded the time budget — kill the kernel (state is lost;
                # a fresh one is spawned on the next execute).
                self.kill()
                return {
                    "stdout": "",
                    "stderr": "",
                    "result": None,
                    "outputs": [],
                    "ok": False,
                    "count": count,
                    "timed_out": True,
                    "duration_ms": duration_ms,
                }
            if line == "":  # EOF → kernel died
                self.kill()
                return _dead(count)

            resp = json.loads(line)
            resp["count"] = count
            resp["timed_out"] = False
            resp["duration_ms"] = duration_ms
            return resp

    def execute_interactive(self, code, timeout, on_input, on_stdout) -> dict:
        """Run a cell that may call input(). Streams stdout chunks via
        ``on_stdout(text)`` and, when the cell calls input(), calls
        ``on_input(prompt)`` (which blocks until the user supplies a line) and
        feeds the result back to the kernel."""
        with self._lock:
            self.exec_count += 1
            count = self.exec_count
            start = time.perf_counter()

            def _dur() -> int:
                return int((time.perf_counter() - start) * 1000)

            try:
                self.proc.stdin.write(
                    json.dumps({"code": code, "interactive": True}) + "\n"
                )
                self.proc.stdin.flush()
            except (BrokenPipeError, OSError):
                self.kill()
                return _dead(count)

            while True:
                line = _readline_timeout(self.proc.stdout, timeout)
                if line is None:  # no event/result within the time budget
                    self.kill()
                    return {
                        "stdout": "",
                        "stderr": "",
                        "result": None,
                        "outputs": [],
                        "ok": False,
                        "count": count,
                        "timed_out": True,
                        "duration_ms": _dur(),
                    }
                if line == "":  # EOF → kernel died
                    self.kill()
                    return _dead(count)
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                kind = msg.get("type")
                if kind == "stdout":
                    on_stdout(msg.get("data", ""))
                elif kind == "input":
                    value = on_input(msg.get("prompt", ""))  # blocks (user-paced)
                    try:
                        self.proc.stdin.write(f"{value}\n")
                        self.proc.stdin.flush()
                    except (BrokenPipeError, OSError):
                        self.kill()
                        return _dead(count)
                elif kind == "result":
                    msg.pop("type", None)
                    msg["count"] = count
                    msg["timed_out"] = False
                    msg["duration_ms"] = _dur()
                    return msg

    def kill(self) -> None:
        try:
            self.proc.kill()
        except Exception:  # noqa: BLE001
            pass


def _dead(count: int) -> dict:
    return {
        "stdout": "",
        "stderr": "kernel หยุดทำงาน — รีสตาร์ทแล้วลองใหม่",
        "result": None,
        "outputs": [],
        "ok": False,
        "count": count,
        "timed_out": False,
        "duration_ms": 0,
    }


def _readline_timeout(stream, timeout: float) -> str | None:
    """Read one line, returning None if it takes longer than ``timeout``."""
    box: dict = {}

    def _read() -> None:
        try:
            box["line"] = stream.readline()
        except Exception:  # noqa: BLE001
            box["line"] = ""

    t = threading.Thread(target=_read, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        return None  # timed out; the daemon thread unblocks once the proc is killed
    return box.get("line", "")


class KernelManager:
    def __init__(self) -> None:
        self._kernels: dict[str, Kernel] = {}
        self._lock = threading.Lock()

    def _get(self, slug: str, interpreter: str, cwd: str) -> Kernel:
        with self._lock:
            k = self._kernels.get(slug)
            if k is None or not k.alive():
                k = Kernel(interpreter, cwd)
                self._kernels[slug] = k
            return k

    def execute(
        self,
        slug: str,
        interpreter: str,
        cwd: str,
        code: str,
        timeout: float,
        stdin: str = "",
    ) -> dict:
        return self._get(slug, interpreter, cwd).execute(code, timeout, stdin)

    def execute_interactive(
        self, slug, interpreter, cwd, code, timeout, on_input, on_stdout
    ) -> dict:
        return self._get(slug, interpreter, cwd).execute_interactive(
            code, timeout, on_input, on_stdout
        )

    def variables(self, slug: str) -> list[dict]:
        k = self._kernels.get(slug)
        if k and k.alive():
            return k.introspect()
        return []

    def complete(self, slug: str, code: str, line: int, column: int) -> list[dict]:
        k = self._kernels.get(slug)
        if k and k.alive():
            return k.complete(code, line, column)
        return []

    def names(self, slug: str) -> list[str] | None:
        """Resolvable names in the kernel, or None if it isn't running yet."""
        k = self._kernels.get(slug)
        if k and k.alive():
            return k.names()
        return None

    def is_alive(self, slug: str) -> bool:
        k = self._kernels.get(slug)
        return bool(k and k.alive())

    def restart(self, slug: str) -> None:
        with self._lock:
            k = self._kernels.pop(slug, None)
        if k:
            k.kill()

    def shutdown(self, slug: str) -> None:
        self.restart(slug)

    def shutdown_workspace(self, slug: str) -> None:
        """Kill every kernel belonging to a workspace. Kernels are keyed
        ``slug:<notebook-path>`` (or bare ``slug``), so a plain shutdown(slug)
        would miss the per-notebook kernels — which hold the venv open and block
        deleting the project on Windows."""
        prefix = f"{slug}:"
        with self._lock:
            keys = [k for k in self._kernels if k == slug or k.startswith(prefix)]
            killed = [self._kernels.pop(k, None) for k in keys]
        for k in killed:
            if k:
                k.kill()


manager = KernelManager()
