"""Persistent Jupyter-style kernel.

Runs as a long-lived child process (one per project) launched with the
project's venv interpreter. It reads one JSON request per line from stdin and
writes one JSON response per line to stdout:

    in : {"code": "x = 1\\nx + 1"}
    out: {"stdout": "", "stderr": "", "result": "2", "ok": true}

State (the ``_ns`` namespace) persists across requests, so variables defined in
one cell are visible in the next — the defining feature of a notebook kernel.
The last expression of a cell is echoed as ``result`` (like Jupyter's Out[n]).

Protocol vs. user output: during execution we redirect sys.stdout/stderr to
buffers so user ``print`` is captured into the response. The protocol itself is
written to the *original* stdout, saved before any redirection.
"""

import ast
import base64
import builtins
import contextlib
import io
import json
import keyword
import re
import sys
import traceback
import types
import warnings

# plt.show() under the Agg backend warns; we capture figures inline instead,
# so silence that one noise message (matches Jupyter's clean output).
warnings.filterwarnings("ignore", message=".*FigureCanvasAgg is non-interactive.*")

_REAL_STDOUT = sys.stdout
# Rich display outputs collected during the current cell (plots, tables, …).
_outputs: list[dict] = []


def _rich_repr(value) -> dict | None:
    """Try Jupyter-style rich representations; None falls back to plain repr."""
    for meth, kind in (("_repr_html_", "html"), ("_repr_svg_", "svg")):
        fn = getattr(value, meth, None)
        if callable(fn):
            try:
                data = fn()
            except Exception:  # noqa: BLE001
                data = None
            if data:
                return {"kind": kind, "data": data}
    for meth, mime in (("_repr_png_", "image/png"), ("_repr_jpeg_", "image/jpeg")):
        fn = getattr(value, meth, None)
        if callable(fn):
            try:
                raw = fn()
            except Exception:  # noqa: BLE001
                raw = None
            if raw:
                data = (
                    base64.b64encode(raw).decode()
                    if isinstance(raw, (bytes, bytearray))
                    else raw
                )
                return {"kind": "image", "mime": mime, "data": data}
    return None


def _display(obj) -> None:
    """A minimal IPython-style display() injected into the namespace."""
    rich = _rich_repr(obj)
    _outputs.append(rich or {"kind": "text", "data": repr(obj)})


_pil_patched = False


def _ensure_pil_patch() -> None:
    """Make PIL Image.show() render inline (like Jupyter) instead of opening an
    OS window. This also catches ultralytics `results.show()`, which calls
    PIL's show() under the hood. Only affects the kernel — .py scripts run in a
    separate process and keep their normal window behaviour."""
    global _pil_patched
    if _pil_patched:
        return
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        return  # PIL not installed yet; retry next cell
    _orig = Image.Image.show

    def _inline_show(self, *args, **kwargs):  # noqa: ANN001
        try:
            buf = io.BytesIO()
            im = self if self.mode in ("RGB", "RGBA", "L") else self.convert("RGB")
            im.save(buf, format="PNG")
            _outputs.append(
                {
                    "kind": "image",
                    "mime": "image/png",
                    "data": base64.b64encode(buf.getvalue()).decode(),
                }
            )
        except Exception:  # noqa: BLE001
            _orig(self, *args, **kwargs)  # fall back to the OS viewer

    Image.Image.show = _inline_show
    _pil_patched = True


def _capture_matplotlib() -> None:
    """Emit any open matplotlib figures as PNGs (inline-backend behaviour).
    Only acts if the user already imported pyplot — never imports it itself."""
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    try:
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
            _outputs.append(
                {
                    "kind": "image",
                    "mime": "image/png",
                    "data": base64.b64encode(buf.getvalue()).decode(),
                }
            )
        plt.close("all")
    except Exception:  # noqa: BLE001
        pass


_ns: dict = {"__name__": "__main__", "display": _display}
# Keys present before any user code runs — excluded from the variable inspector.
_BASELINE = set(_ns) | {"__builtins__"}


def _introspect() -> dict:
    """List user-defined variables (name, type, short preview) for the inspector."""
    out = []
    for name, value in list(_ns.items()):
        if name in _BASELINE or name.startswith("__"):
            continue
        if isinstance(value, types.ModuleType):
            continue
        try:
            preview = repr(value)
        except Exception:  # noqa: BLE001
            preview = "<unrepr-able>"
        preview = preview.replace("\n", " ")
        if len(preview) > 120:
            preview = preview[:117] + "…"
        out.append({"name": name, "type": type(value).__name__, "preview": preview})
    out.sort(key=lambda v: v["name"])
    return {"vars": out}


def _complete(code: str, line: int, column: int) -> dict:
    """Completion against the live namespace — `obj.<TAB>` lists real attributes
    of the running object, bare names complete from namespace + builtins +
    keywords. No external deps; uses the kernel's actual state."""
    rows = code.split("\n")
    if not (1 <= line <= len(rows)):
        return {"completions": []}
    text = rows[line - 1][:column]
    m = re.search(r"([A-Za-z_][A-Za-z0-9_.]*)$", text)
    token = m.group(1) if m else ""

    if "." in token:
        obj_path, _, partial = token.rpartition(".")
        try:
            obj = eval(obj_path, _ns)  # noqa: S307 — user's own namespace, local
        except Exception:  # noqa: BLE001
            return {"completions": []}
        names = dir(obj)
        comps = [
            n
            for n in names
            if n.startswith(partial) and (partial.startswith("_") or not n.startswith("_"))
        ]
        return {"completions": [{"label": n, "type": "property"} for n in sorted(comps)[:80]]}

    partial = token
    pool = set(_ns) | set(dir(builtins)) | set(keyword.kwlist)
    comps = [n for n in pool if n.startswith(partial) and not n.startswith("__")]
    return {"completions": [{"label": n, "type": ""} for n in sorted(comps)[:80]]}


def _names() -> dict:
    """All names currently resolvable in the kernel — used by the cell linter to
    tell a genuinely-undefined name from one defined in another cell."""
    return {
        "names": sorted(set(_ns) | set(dir(builtins)) | set(keyword.kwlist)),
    }


def _emit(obj: dict) -> None:
    _REAL_STDOUT.write(json.dumps(obj) + "\n")
    _REAL_STDOUT.flush()


def _run_cell(code: str, stdin: str = "", interactive: bool = False) -> dict:
    out, err = io.StringIO(), io.StringIO()
    result = None
    ok = True
    _outputs.clear()
    _ensure_pil_patch()  # route PIL/ultralytics .show() to inline output

    real_stdin = sys.stdin
    orig_input = builtins.input
    if interactive:
        # input() pauses the cell: flush the stdout printed so far, ask the
        # frontend for a line (inline prompt + box), and resume with the typed
        # value (read from the real protocol stdin — the backend sends it next).
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
        sys.stdin = io.StringIO("")
    else:
        # point sys.stdin at the caller-supplied buffer (empty → EOF, as before)
        sys.stdin = io.StringIO(stdin)
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                block = ast.parse(code, "<cell>", "exec")
                last_expr = None
                if block.body and isinstance(block.body[-1], ast.Expr):
                    last_expr = ast.Expression(block.body.pop().value)
                exec(compile(block, "<cell>", "exec"), _ns)
                if last_expr is not None:
                    value = eval(compile(last_expr, "<cell>", "eval"), _ns)
                    if value is not None:
                        rich = _rich_repr(value)
                        if rich:
                            _outputs.append(rich)
                        else:
                            result = repr(value)
            except SystemExit:
                pass
            except BaseException:  # noqa: BLE001 — surface any user error
                traceback.print_exc()
                ok = False
            finally:
                _capture_matplotlib()
    finally:
        sys.stdin = real_stdin
        builtins.input = orig_input

    return {
        "stdout": out.getvalue(),
        "stderr": err.getvalue(),
        "result": result,
        "outputs": list(_outputs),
        "ok": ok,
    }


def main() -> None:
    # readline (not `for line in sys.stdin`) so interactive input() can read
    # extra value lines mid-cell without fighting the iterator's buffering.
    while True:
        line = sys.stdin.readline()
        if line == "":
            break  # EOF — backend closed the kernel
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            if req.get("introspect"):
                resp = _introspect()
            elif req.get("names"):
                resp = _names()
            elif req.get("complete"):
                resp = _complete(
                    req.get("code", ""), req.get("line", 1), req.get("column", 0)
                )
            elif req.get("interactive"):
                res = _run_cell(req.get("code", ""), interactive=True)
                _emit({"type": "result", **res})
                continue
            else:
                resp = _run_cell(req.get("code", ""), req.get("stdin", ""))
        except Exception as exc:  # noqa: BLE001 — never let the loop die
            resp = {"stdout": "", "stderr": f"kernel error: {exc}", "result": None, "ok": False}
        _emit(resp)


if __name__ == "__main__":
    main()
