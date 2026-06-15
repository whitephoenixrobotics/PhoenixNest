"""Script runner — executes Python in a subprocess and returns its output.
This deliberately runs arbitrary user code; it is meant for the local
playground only (same trust model as a local Jupyter kernel), so the API binds
to loopback and every run is time-boxed.

Implementation notes:
* We use the blocking ``subprocess.run`` inside a worker thread (via
  ``asyncio.to_thread``) rather than ``asyncio.create_subprocess_exec``. On
  Windows the asyncio subprocess transport requires the ProactorEventLoop, but
  uvicorn's ``--reload`` mode runs under a SelectorEventLoop, which raises
  NotImplementedError. The thread-based approach works under any event loop.
* ``-X utf8`` forces UTF-8 Mode so the child can emit any character (emoji,
  Thai, …). Plain Windows consoles default to a legacy code page (e.g. cp874)
  and would otherwise raise UnicodeEncodeError. ``-X`` is honoured even under
  ``-I``, where ``PYTHONIOENCODING`` would be ignored.
"""

import asyncio
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.kernel import _readline_timeout

router = APIRouter(prefix="/api", tags=["run"])

# Hard ceiling so a runaway script (infinite loop) can't hang the backend
# forever. Generous because ML cells (download/train/inference) run long; the
# kernel's Restart button is the instant escape hatch.
MAX_TIMEOUT = 3600.0  # 1 hour
DEFAULT_TIMEOUT = 15.0


class RunRequest(BaseModel):
    code: str
    timeout: float = Field(default=DEFAULT_TIMEOUT, gt=0, le=MAX_TIMEOUT)


class RunResult(BaseModel):
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool


def execute(
    argv: list[str], cwd: str, timeout: float, stdin: str = ""
) -> RunResult:
    """Run ``argv`` in ``cwd``, capturing output. ``stdin`` is fed to the
    process so scripts using ``input()`` can read pre-supplied lines. Blocking —
    call in a thread."""
    start = time.perf_counter()
    timed_out = False
    try:
        proc = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            timeout=timeout,
            input=stdin.encode("utf-8"),
        )
        stdout_b, stderr_b, exit_code = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired as exc:
        # subprocess.run kills the child on timeout; keep any partial output.
        timed_out = True
        stdout_b = exc.stdout or b""
        stderr_b = exc.stderr or b""
        exit_code = None

    duration_ms = int((time.perf_counter() - start) * 1000)
    return RunResult(
        stdout=stdout_b.decode("utf-8", errors="replace"),
        stderr=stderr_b.decode("utf-8", errors="replace"),
        exit_code=exit_code,
        duration_ms=duration_ms,
        timed_out=timed_out,
    )


def run_file_interactive(argv, cwd, timeout, on_input, on_stdout) -> dict:
    """Run a script via script_runner.py, streaming stdout chunks (on_stdout)
    and pausing for input() (on_input(prompt) blocks until a line is supplied).
    Blocking — call in a thread. Returns a RunResult-shaped dict."""
    proc = subprocess.Popen(
        argv,
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    start = time.perf_counter()

    def _dur() -> int:
        return int((time.perf_counter() - start) * 1000)

    try:
        while True:
            line = _readline_timeout(proc.stdout, timeout)
            if line is None:
                proc.kill()
                return {
                    "stdout": "",
                    "stderr": "",
                    "exit_code": None,
                    "duration_ms": _dur(),
                    "timed_out": True,
                }
            if line == "":  # runner exited without a result line
                code = proc.wait()
                return {
                    "stdout": "",
                    "stderr": "",
                    "exit_code": code,
                    "duration_ms": _dur(),
                    "timed_out": False,
                }
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
                    proc.stdin.write(f"{value}\n")
                    proc.stdin.flush()
                except (BrokenPipeError, OSError):
                    proc.kill()
                    return {
                        "stdout": "",
                        "stderr": "",
                        "exit_code": None,
                        "duration_ms": _dur(),
                        "timed_out": False,
                    }
            elif kind == "result":
                try:
                    proc.wait(timeout=5)
                except Exception:  # noqa: BLE001
                    pass
                return {
                    "stdout": msg.get("stdout", ""),
                    "stderr": msg.get("stderr", ""),
                    "exit_code": msg.get("exit_code", 0),
                    "duration_ms": _dur(),
                    "timed_out": False,
                }
    finally:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:  # noqa: BLE001
            pass


def _run_snippet(code: str, timeout: float) -> RunResult:
    """Run a standalone snippet in an isolated temp dir."""
    with tempfile.TemporaryDirectory(prefix="phoenix-run-") as tmp:
        script = Path(tmp) / "snippet.py"
        script.write_text(code, encoding="utf-8")
        return execute(
            [sys.executable, "-I", "-X", "utf8", "-u", str(script)], tmp, timeout
        )


@router.post("/run", response_model=RunResult)
async def run_script(req: RunRequest) -> RunResult:
    timeout = min(req.timeout, MAX_TIMEOUT)
    return await asyncio.to_thread(_run_snippet, req.code, timeout)
