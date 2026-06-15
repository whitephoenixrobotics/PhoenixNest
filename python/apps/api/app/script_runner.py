"""One-shot interactive script runner (for running a .py with live input()).

Launched as `python -u script_runner.py <target.py>`. It runs the target as
__main__ but patches builtins.input() so the program can pause for input: the
prompt + buffered stdout are emitted as JSON-line events on the *real* stdout
(saved before redirection), and the typed value is read back from stdin. This
mirrors the notebook kernel's interactive protocol so the same WebSocket
plumbing drives both.

Protocol (one JSON object per line on stdout):
    {"type": "stdout", "data": "..."}                 # buffered program output
    {"type": "input", "prompt": "..."}                # paused; needs a line
    {"type": "result", "stdout","stderr","ok","exit_code"}   # finished
The backend replies to an input event by writing the value + "\n" to stdin.
"""

import builtins
import contextlib
import io
import json
import runpy
import sys
import traceback

_REAL_STDOUT = sys.stdout


def _emit(obj: dict) -> None:
    _REAL_STDOUT.write(json.dumps(obj) + "\n")
    _REAL_STDOUT.flush()


def main() -> None:
    if len(sys.argv) < 2:
        _emit({"type": "result", "stdout": "", "stderr": "no target", "ok": False, "exit_code": 1})
        return
    target = sys.argv[1]
    out, err = io.StringIO(), io.StringIO()
    real_stdin = sys.stdin

    def _live_input(prompt: str = "") -> str:
        cur = out.getvalue()
        if cur:
            _emit({"type": "stdout", "data": cur})
            out.seek(0)
            out.truncate(0)
        _emit({"type": "input", "prompt": str(prompt)})
        line = real_stdin.readline()
        if line == "":
            raise EOFError
        return line.rstrip("\n")

    builtins.input = _live_input
    ok = True
    exit_code = 0
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                runpy.run_path(target, run_name="__main__")
            except SystemExit as e:
                exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            except BaseException:  # noqa: BLE001 — surface any user error
                traceback.print_exc()
                ok = False
                exit_code = 1
    finally:
        _emit(
            {
                "type": "result",
                "stdout": out.getvalue(),
                "stderr": err.getvalue(),
                "ok": ok,
                "exit_code": exit_code,
            }
        )


if __name__ == "__main__":
    main()
