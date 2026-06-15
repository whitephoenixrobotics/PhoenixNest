"""Project management — each project is a real folder on disk with starter
files and its own virtualenv. Scripts run with the project's venv interpreter.
"""

import asyncio
import json
import mimetypes
import platform
import re
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app import workspaces
from app.kernel import manager as kernels
from app.paths import PROJECTS_DIR, ensure_dirs, find_venv_python
from app.routers.run import (
    MAX_TIMEOUT,
    RunResult,
    execute,
    run_file_interactive,
)

# One-shot interactive script runner (app/script_runner.py).
_SCRIPT_RUNNER = str(Path(__file__).resolve().parent.parent / "script_runner.py")
from app.routers.tools import (
    CELL_LINT_IGNORE,
    CodeBody,
    Diagnostic,
    ruff_diagnostics,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

# App metadata lives in a hidden .phoenix/ folder so it doesn't clutter the
# user's file tree (like .git / .vscode).
PHOENIX = ".phoenix"

VENV_TIMEOUT = 180.0  # creating a venv can be slow on first run


def _meta_file(proj: Path) -> Path:
    return proj / PHOENIX / "project.json"


def _ipynb_file(proj: Path) -> Path:
    # Standard Jupyter notebook at the project root — portable + visible.
    return proj / "main.ipynb"


def _py_version(proj: Path) -> str:
    try:
        return json.loads(_meta_file(proj).read_text(encoding="utf-8")).get(
            "python_version", "3"
        )
    except Exception:  # noqa: BLE001
        return platform.python_version()


def _cells_to_ipynb(cells: list[dict], py_version: str) -> dict:
    """Our cell list → nbformat 4.5 document."""
    nb_cells = []
    for c in cells:
        src = (c.get("source") or "").splitlines(keepends=True)
        if c.get("kind") == "markdown":
            nb_cells.append(
                {"cell_type": "markdown", "id": c["id"], "metadata": {}, "source": src}
            )
        else:
            nb_cells.append(
                {
                    "cell_type": "code",
                    "id": c["id"],
                    "metadata": {},
                    "execution_count": None,
                    "outputs": [],
                    "source": src,
                }
            )
    return {
        "cells": nb_cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": py_version},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def _ipynb_to_cells(nb: dict) -> list[dict]:
    """nbformat document → our cell list."""
    out = []
    for i, c in enumerate(nb.get("cells", [])):
        src = c.get("source", "")
        if isinstance(src, list):
            src = "".join(src)
        kind = "markdown" if c.get("cell_type") == "markdown" else "code"
        out.append({"id": c.get("id") or f"cell-{i + 1}", "source": src, "kind": kind})
    return out


def _ensure_phoenix(proj: Path) -> None:
    """Create .phoenix/, migrate legacy project.json into it, and convert any
    legacy notebook.json (root or .phoenix) into a standard main.ipynb."""
    ph = proj / PHOENIX
    ph.mkdir(exist_ok=True)

    legacy_meta = proj / "project.json"
    if legacy_meta.exists() and not _meta_file(proj).exists():
        legacy_meta.replace(_meta_file(proj))

    if not _ipynb_file(proj).exists():
        for cand in (proj / "notebook.json", ph / "notebook.json"):
            if cand.exists():
                try:
                    cells = json.loads(cand.read_text(encoding="utf-8")).get("cells")
                except Exception:  # noqa: BLE001
                    cells = None
                _ipynb_file(proj).write_text(
                    json.dumps(
                        _cells_to_ipynb(cells or DEFAULT_CELLS, _py_version(proj)),
                        ensure_ascii=False,
                        indent=1,
                    ),
                    encoding="utf-8",
                )
                cand.unlink()
                break


# ── models ───────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class Project(BaseModel):
    slug: str
    name: str
    description: str = ""
    created_at: str
    python_version: str = ""
    has_venv: bool = False


class ProjectDetail(Project):
    main: str = ""


class FileBody(BaseModel):
    content: str


class RunBody(BaseModel):
    code: str
    timeout: float = Field(default=600.0, gt=0, le=MAX_TIMEOUT)


class Cell(BaseModel):
    id: str
    source: str = ""
    kind: str = "code"  # "code" | "markdown"


class Notebook(BaseModel):
    cells: list[Cell]


class ExecBody(BaseModel):
    code: str
    # 10 min default — long enough for model download / inference / light
    # training; Restart kernel to interrupt sooner.
    timeout: float = Field(default=600.0, gt=0, le=MAX_TIMEOUT)
    stdin: str = ""  # fed to the cell so input() can read pre-supplied lines


class RunFileBody(BaseModel):
    stdin: str = ""


class CompleteBody(BaseModel):
    code: str
    line: int
    column: int


class KernelCompletion(BaseModel):
    label: str
    type: str = ""


class Package(BaseModel):
    name: str
    version: str


class PackageBody(BaseModel):
    name: str


def _interp(proj: Path) -> str:
    py = find_venv_python(proj)
    return str(py) if py else sys.executable


class CellOutput(BaseModel):
    kind: str  # "html" | "svg" | "image" | "text"
    data: str = ""
    mime: str = ""


class ExecResult(BaseModel):
    stdout: str = ""
    stderr: str = ""
    result: str | None = None
    outputs: list[CellOutput] = []
    ok: bool = True
    count: int = 0
    timed_out: bool = False
    duration_ms: int = 0


class Variable(BaseModel):
    name: str
    type: str
    preview: str


class FileEntry(BaseModel):
    name: str
    path: str  # relative to the project root, forward-slashed
    is_dir: bool
    size: int = 0


class FileContent(BaseModel):
    editable: bool
    content: str = ""
    reason: str = ""  # "binary" | "large" when not editable


class FileSave(BaseModel):
    path: str
    content: str


class CreateBody(BaseModel):
    path: str
    is_dir: bool = False


class RenameBody(BaseModel):
    path: str
    new_name: str


class MoveBody(BaseModel):
    path: str
    dest_dir: str = ""  # target folder (relative); "" = project root


# Names that must not be deleted/renamed via the file API.
_PROTECTED = {"project.json", "notebook.json", PHOENIX}
# Cap for opening a file as editable text/table. Runs locally (Electron, like
# flow) so network isn't a concern — this only guards the Chromium renderer
# from freezing on a huge file in the editor/table.
_MAX_EDIT_BYTES = 10_000_000


DEFAULT_CELLS = [
    {
        "id": "cell-1",
        "kind": "markdown",
        "source": "# โน้ตบุ๊กใหม่\nเขียนคำอธิบายแบบ Markdown ที่นี่ แล้วเพิ่มเซลล์โค้ดด้านล่าง",
    },
    {
        "id": "cell-2",
        "kind": "code",
        "source": 'print("Hello from Phoenix Nest \U0001f40d")',
    },
]

# Names never shown in the file sidebar (besides dotfiles, hidden by default).
_HIDDEN = {"venv", "__pycache__", ".git"}


def _has_meta(proj: Path) -> bool:
    return (proj / PHOENIX / "project.json").exists() or (
        proj / "project.json"
    ).exists()


# ── helpers ──────────────────────────────────────────────────────────
def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "project"


def _unique_slug(name: str) -> str:
    ensure_dirs()
    base = _slugify(name)
    slug, n = base, 2
    while (PROJECTS_DIR / slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _project_dir(slug: str) -> Path:
    # New model: `slug` is a workspace id pointing at an opened folder anywhere
    # on disk. (Legacy managed projects under data/projects/ still resolve too.)
    ws = workspaces.get(slug)
    if ws:
        root = Path(ws["path"])
        if not root.is_dir():
            raise HTTPException(status_code=404, detail="ไม่พบโฟลเดอร์")
        return root
    proj = PROJECTS_DIR / slug
    if not proj.is_dir() or not _has_meta(proj):
        raise HTTPException(status_code=404, detail="ไม่พบโปรเจค")
    _ensure_phoenix(proj)  # migrate legacy root metadata on access
    return proj


def _read_meta(proj: Path) -> dict:
    meta = json.loads(_meta_file(proj).read_text(encoding="utf-8"))
    meta["has_venv"] = find_venv_python(proj) is not None
    return meta


def _create_venv(proj: Path) -> None:
    subprocess.run(
        [sys.executable, "-m", "venv", str(proj / "venv")],
        capture_output=True,
        timeout=VENV_TIMEOUT,
    )


# ── endpoints ────────────────────────────────────────────────────────
@router.get("", response_model=list[Project])
def list_projects() -> list[Project]:
    ensure_dirs()
    items: list[Project] = []
    for d in sorted(PROJECTS_DIR.iterdir()):
        if d.is_dir() and _has_meta(d):
            _ensure_phoenix(d)
            items.append(Project(**_read_meta(d)))
    items.sort(key=lambda p: p.created_at, reverse=True)
    return items


@router.post("", response_model=Project)
async def create_project(body: ProjectCreate) -> Project:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="ต้องระบุชื่อโปรเจค")

    slug = _unique_slug(name)
    proj = PROJECTS_DIR / slug
    (proj / PHOENIX).mkdir(parents=True)

    meta = {
        "slug": slug,
        "name": name,
        "description": body.description.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "python_version": platform.python_version(),
        "has_venv": False,
    }
    # User-facing starter files (kept), then app metadata in hidden .phoenix/.
    (proj / "README.md").write_text(
        f"# {name}\n\n{meta['description']}\n", encoding="utf-8"
    )
    (proj / "requirements.txt").write_text("", encoding="utf-8")
    _meta_file(proj).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _ipynb_file(proj).write_text(
        json.dumps(
            _cells_to_ipynb(DEFAULT_CELLS, meta["python_version"]),
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    # Creating the venv is the slow part — run it off the event loop.
    await asyncio.to_thread(_create_venv, proj)
    meta["has_venv"] = find_venv_python(proj) is not None
    return Project(**meta)


@router.get("/{slug}", response_model=ProjectDetail)
def get_project(slug: str) -> ProjectDetail:
    proj = _project_dir(slug)
    meta = _read_meta(proj)
    main = proj / "main.py"
    meta["main"] = main.read_text(encoding="utf-8") if main.exists() else ""
    return ProjectDetail(**meta)


@router.put("/{slug}/file")
def save_file(slug: str, body: FileBody) -> dict:
    proj = _project_dir(slug)
    (proj / "main.py").write_text(body.content, encoding="utf-8")
    return {"ok": True}


@router.post("/{slug}/run", response_model=RunResult)
async def run_project(slug: str, body: RunBody) -> RunResult:
    proj = _project_dir(slug)
    # Persist the editor content first so the run reflects what's on screen.
    (proj / "main.py").write_text(body.code, encoding="utf-8")

    py = find_venv_python(proj)
    interpreter = str(py) if py else sys.executable
    timeout = min(body.timeout, MAX_TIMEOUT)
    return await asyncio.to_thread(
        execute,
        [interpreter, "-I", "-X", "utf8", "-u", "main.py"],
        str(proj),
        timeout,
    )


def _safe_path(proj: Path, rel: str) -> Path:
    """Resolve a project-relative path, refusing anything outside the project."""
    root = proj.resolve()
    target = (proj / rel).resolve()
    if target != root and root not in target.parents:
        raise HTTPException(status_code=400, detail="เส้นทางไม่ถูกต้อง")
    return target


def _nb_path(proj: Path, path: str) -> Path:
    # `path` is the relative .ipynb to open; empty falls back to main.ipynb.
    return _safe_path(proj, path) if path else _ipynb_file(proj)


def _kernel_key(slug: str, path: str) -> str:
    # One kernel per (workspace, notebook file) — like VS Code per-notebook.
    return f"{slug}:{path}" if path else slug


# ── notebook ─────────────────────────────────────────────────────────
@router.get("/{slug}/notebook", response_model=Notebook)
def get_notebook(slug: str, path: str = Query("")) -> Notebook:
    proj = _project_dir(slug)
    ip = _nb_path(proj, path)
    cells = DEFAULT_CELLS
    if ip.exists():
        try:
            parsed = _ipynb_to_cells(json.loads(ip.read_text(encoding="utf-8")))
            if parsed:
                cells = parsed
        except (json.JSONDecodeError, ValueError):
            cells = DEFAULT_CELLS  # empty/invalid .ipynb → start fresh
    return Notebook(cells=[Cell(**c) for c in cells])


@router.put("/{slug}/notebook")
def save_notebook(slug: str, body: Notebook, path: str = Query("")) -> dict:
    proj = _project_dir(slug)
    nb = _cells_to_ipynb([c.model_dump() for c in body.cells], _py_version(proj))
    _nb_path(proj, path).write_text(
        json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return {"ok": True}


# ── kernel ───────────────────────────────────────────────────────────
@router.post("/{slug}/kernel/execute", response_model=ExecResult)
async def kernel_execute(
    slug: str, body: ExecBody, path: str = Query("")
) -> ExecResult:
    proj = _project_dir(slug)
    py = find_venv_python(proj)
    interpreter = str(py) if py else sys.executable
    timeout = min(body.timeout, MAX_TIMEOUT)
    res = await asyncio.to_thread(
        kernels.execute,
        _kernel_key(slug, path),
        interpreter,
        str(proj),
        body.code,
        timeout,
        body.stdin,
    )
    return ExecResult(**res)


@router.websocket("/{slug}/kernel/ws")
async def kernel_ws(websocket: WebSocket, slug: str, path: str = Query("")) -> None:
    """Interactive cell run over a WebSocket. Streams `{type:'stdout'|'input'|
    'result'|'error'}`; the client replies to an input request with
    `{type:'input', value:'...'}` (matches Jupyter's inline input prompt)."""
    await websocket.accept()
    try:
        proj = _project_dir(slug)
    except HTTPException:
        await websocket.close()
        return
    interpreter = _interp(proj)
    key = _kernel_key(slug, path)
    loop = asyncio.get_running_loop()

    try:
        first = await websocket.receive_json()
    except WebSocketDisconnect:
        return
    code = first.get("code", "")
    timeout = min(float(first.get("timeout", 600.0)), MAX_TIMEOUT)

    def on_stdout(data: str) -> None:
        asyncio.run_coroutine_threadsafe(
            websocket.send_json({"type": "stdout", "data": data}), loop
        )

    async def _ask(prompt: str) -> str:
        await websocket.send_json({"type": "input", "prompt": prompt})
        try:
            msg = await websocket.receive_json()
        except WebSocketDisconnect:
            return ""  # disconnect → empty line (input() sees blank/EOF-ish)
        return str(msg.get("value", ""))

    def on_input(prompt: str) -> str:
        return asyncio.run_coroutine_threadsafe(_ask(prompt), loop).result()

    try:
        res = await asyncio.to_thread(
            kernels.execute_interactive,
            key,
            interpreter,
            str(proj),
            code,
            timeout,
            on_input,
            on_stdout,
        )
        await websocket.send_json({"type": "result", **res})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


@router.post("/{slug}/kernel/restart")
def kernel_restart(slug: str, path: str = Query("")) -> dict:
    _project_dir(slug)
    kernels.restart(_kernel_key(slug, path))
    return {"ok": True}


@router.get("/{slug}/kernel/vars", response_model=list[Variable])
def kernel_vars(slug: str, path: str = Query("")) -> list[Variable]:
    _project_dir(slug)
    return [Variable(**v) for v in kernels.variables(_kernel_key(slug, path))]


@router.post("/{slug}/kernel/complete", response_model=list[KernelCompletion])
def kernel_complete(
    slug: str, body: CompleteBody, path: str = Query("")
) -> list[KernelCompletion]:
    _project_dir(slug)
    items = kernels.complete(
        _kernel_key(slug, path), body.code, body.line, body.column
    )
    return [KernelCompletion(**c) for c in items]


_F821_NAME = re.compile(r"`([^`]+)`")


@router.post("/{slug}/kernel/lint", response_model=list[Diagnostic])
async def kernel_lint(
    slug: str, body: CodeBody, path: str = Query("")
) -> list[Diagnostic]:
    """Kernel-aware cell lint: run Ruff with undefined-name (F821) enabled, then
    drop F821 warnings for names that actually live in the kernel (i.e. defined
    in another cell). Genuinely-undefined names — e.g. a forgotten import — stay
    flagged. Falls back to suppressing all F821 when no kernel is running yet,
    so we never show false positives before the user has executed anything."""
    _project_dir(slug)
    diags = await ruff_diagnostics(body.code, CELL_LINT_IGNORE)
    names = await asyncio.to_thread(kernels.names, _kernel_key(slug, path))
    if names is None:
        return [d for d in diags if d.code != "F821"]
    known = set(names)
    out: list[Diagnostic] = []
    for d in diags:
        if d.code == "F821":
            m = _F821_NAME.search(d.message)
            if m and m.group(1) in known:
                continue  # defined in a previous cell — not actually undefined
        out.append(d)
    return out


# ── packages (pip in the project venv) ───────────────────────────────
# pip's own tooling — hidden from the "top-level" view.
_PIP_TOOLING = {"pip", "setuptools", "wheel"}


@router.get("/{slug}/packages", response_model=list[Package])
def list_packages(slug: str, top_only: bool = False) -> list[Package]:
    """List installed packages. top_only → only packages nothing else depends
    on (the ones you actually installed, not pulled-in dependencies)."""
    proj = _project_dir(slug)
    args = [_interp(proj), "-m", "pip", "list", "--format=json",
            "--disable-pip-version-check"]
    if top_only:
        args.append("--not-required")
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=30)
        items = json.loads(proc.stdout or "[]")
    except Exception:  # noqa: BLE001
        items = []
    pkgs = [
        Package(name=i["name"], version=i["version"])
        for i in items
        if not (top_only and i["name"].lower() in _PIP_TOOLING)
    ]
    pkgs.sort(key=lambda p: p.name.lower())
    return pkgs


@router.post("/{slug}/packages/uninstall")
def uninstall_package(slug: str, body: PackageBody) -> dict:
    proj = _project_dir(slug)
    name = body.name.strip()
    if not name or name.startswith("-"):
        raise HTTPException(status_code=400, detail="ชื่อ package ไม่ถูกต้อง")
    proc = subprocess.run(
        [_interp(proj), "-m", "pip", "uninstall", "-y", name,
         "--disable-pip-version-check"],
        capture_output=True, text=True, timeout=120,
    )
    return {"ok": proc.returncode == 0, "log": (proc.stdout + proc.stderr).strip()}


@router.post("/{slug}/packages/install")
async def install_package(slug: str, body: PackageBody) -> StreamingResponse:
    """Run `pip install <name>` streaming its output as SSE."""
    proj = _project_dir(slug)
    name = body.name.strip()
    if not name or name.startswith("-"):
        raise HTTPException(status_code=400, detail="ชื่อ package ไม่ถูกต้อง")
    interp = _interp(proj)

    async def gen():
        proc = subprocess.Popen(
            [interp, "-m", "pip", "install", name, "--disable-pip-version-check"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", bufsize=1,
        )
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def reader():
            for line in proc.stdout:  # type: ignore[union-attr]
                loop.call_soon_threadsafe(q.put_nowait, line)
            loop.call_soon_threadsafe(q.put_nowait, None)

        threading.Thread(target=reader, daemon=True).start()
        while True:
            line = await q.get()
            if line is None:
                break
            yield f"data: {json.dumps({'line': line.rstrip()})}\n\n"
        proc.wait()
        yield f"data: {json.dumps({'done': proc.returncode})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


def _safe_subdir(proj: Path, rel: str) -> Path:
    target = _safe_path(proj, rel)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="ไม่พบโฟลเดอร์")
    return target


@router.get("/{slug}/files", response_model=list[FileEntry])
def list_files(
    slug: str,
    path: str = Query(""),
    show_hidden: bool = Query(False),
) -> list[FileEntry]:
    proj = _project_dir(slug)
    target = _safe_subdir(proj, path)
    root = proj.resolve()
    entries: list[FileEntry] = []
    for p in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        if not show_hidden and (p.name in _HIDDEN or p.name.startswith(".")):
            continue
        entries.append(
            FileEntry(
                name=p.name,
                path=p.resolve().relative_to(root).as_posix(),
                is_dir=p.is_dir(),
                size=p.stat().st_size if p.is_file() else 0,
            )
        )
    return entries


@router.post("/{slug}/files/upload")
async def upload_file(
    slug: str,
    path: str = Query(""),
    file: UploadFile = File(...),
) -> dict:
    proj = _project_dir(slug)
    target = _safe_subdir(proj, path)
    # Strip any directory components from the client-supplied name.
    dest = target / Path(file.filename or "upload").name
    _ensure_writable(proj, dest)
    dest.write_bytes(await file.read())
    return {"ok": True, "name": dest.name}


@router.post("/{slug}/run-file", response_model=RunResult)
async def run_file(
    slug: str,
    path: str = Query(...),
    timeout: float = Query(600.0),
    body: RunFileBody | None = None,
) -> RunResult:
    """Run a .py file as a normal script (venv interpreter, cwd = workspace).
    Any ``body.stdin`` is fed to the process for input()."""
    proj = _project_dir(slug)
    target = _safe_path(proj, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    py = find_venv_python(proj)
    interp = str(py) if py else sys.executable
    t = min(timeout, MAX_TIMEOUT)
    stdin = body.stdin if body else ""
    # No -I: keep the script's own directory on sys.path so local imports work.
    return await asyncio.to_thread(
        execute, [interp, "-X", "utf8", "-u", str(target)], str(proj), t, stdin
    )


@router.websocket("/{slug}/run-file/ws")
async def run_file_ws(websocket: WebSocket, slug: str, path: str = Query("")) -> None:
    """Interactive .py run over a WebSocket — same event protocol as the kernel
    WS, so the program can pause for input() with an inline prompt + box."""
    await websocket.accept()
    try:
        proj = _project_dir(slug)
        target = _safe_path(proj, path)
        if not target.is_file():
            await websocket.close()
            return
    except HTTPException:
        await websocket.close()
        return
    interp = _interp(proj)
    loop = asyncio.get_running_loop()

    try:
        first = await websocket.receive_json()
    except WebSocketDisconnect:
        return
    timeout = min(float(first.get("timeout", 600.0)), MAX_TIMEOUT)

    def on_stdout(data: str) -> None:
        asyncio.run_coroutine_threadsafe(
            websocket.send_json({"type": "stdout", "data": data}), loop
        )

    async def _ask(prompt: str) -> str:
        await websocket.send_json({"type": "input", "prompt": prompt})
        try:
            msg = await websocket.receive_json()
        except WebSocketDisconnect:
            return ""
        return str(msg.get("value", ""))

    def on_input(prompt: str) -> str:
        return asyncio.run_coroutine_threadsafe(_ask(prompt), loop).result()

    argv = [interp, "-X", "utf8", "-u", _SCRIPT_RUNNER, str(target)]
    try:
        res = await asyncio.to_thread(
            run_file_interactive, argv, str(proj), timeout, on_input, on_stdout
        )
        await websocket.send_json({"type": "result", **res})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


@router.get("/{slug}/files/raw")
def get_file_raw(slug: str, path: str = Query(...)) -> FileResponse:
    """Serve a file's raw bytes (images, etc.) with a guessed content type."""
    proj = _project_dir(slug)
    f = _safe_path(proj, path)
    if not f.is_file():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    media = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
    return FileResponse(str(f), media_type=media)


@router.get("/{slug}/files/content", response_model=FileContent)
def get_file_content(slug: str, path: str = Query(...)) -> FileContent:
    proj = _project_dir(slug)
    f = _safe_path(proj, path)
    if not f.is_file():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    if f.stat().st_size > _MAX_EDIT_BYTES:
        return FileContent(editable=False, reason="large")
    try:
        return FileContent(editable=True, content=f.read_text("utf-8"))
    except UnicodeDecodeError:
        return FileContent(editable=False, reason="binary")


def _ensure_writable(proj: Path, target: Path) -> None:
    """Refuse writes to app-managed files — anything inside .phoenix/ or the
    protected metadata names — so the editor/upload can't corrupt project or
    notebook metadata."""
    try:
        parts = target.resolve().relative_to(proj.resolve()).parts
    except ValueError:
        return  # outside the project — _safe_path already guards this
    if target.name in _PROTECTED or PHOENIX in parts:
        raise HTTPException(status_code=403, detail="แก้ไขไฟล์ระบบไม่ได้")


@router.put("/{slug}/files/content")
def save_file_content(slug: str, body: FileSave) -> dict:
    proj = _project_dir(slug)
    f = _safe_path(proj, body.path)
    _ensure_writable(proj, f)
    if not f.parent.is_dir():
        raise HTTPException(status_code=400, detail="ไม่พบโฟลเดอร์ปลายทาง")
    f.write_text(body.content, encoding="utf-8")
    return {"ok": True}


@router.post("/{slug}/files/create")
def create_entry(slug: str, body: CreateBody) -> FileEntry:
    proj = _project_dir(slug)
    target = _safe_path(proj, body.path)
    _ensure_writable(proj, target)
    if target == proj.resolve():
        raise HTTPException(status_code=400, detail="ชื่อไม่ถูกต้อง")
    if target.exists():
        raise HTTPException(status_code=409, detail="มีไฟล์/โฟลเดอร์นี้อยู่แล้ว")
    if body.is_dir:
        target.mkdir(parents=True)
    else:
        if not target.parent.is_dir():
            raise HTTPException(status_code=400, detail="ไม่พบโฟลเดอร์ปลายทาง")
        target.write_text("", encoding="utf-8")
    return FileEntry(
        name=target.name,
        path=target.resolve().relative_to(proj.resolve()).as_posix(),
        is_dir=body.is_dir,
    )


@router.post("/{slug}/files/rename", response_model=FileEntry)
def rename_entry(slug: str, body: RenameBody) -> FileEntry:
    proj = _project_dir(slug)
    src = _safe_path(proj, body.path)
    if src == proj.resolve() or not src.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    if src.name in _PROTECTED:
        raise HTTPException(status_code=403, detail="เปลี่ยนชื่อไฟล์ระบบไม่ได้")
    new_name = Path(body.new_name).name  # strip any path components
    if not new_name:
        raise HTTPException(status_code=400, detail="ชื่อไม่ถูกต้อง")
    dst = src.parent / new_name
    if dst.exists():
        raise HTTPException(status_code=409, detail="มีชื่อนี้อยู่แล้ว")
    if src.name == "venv" and src.parent == proj.resolve():
        from app.routers.terminal import manager as terminals

        kernels.shutdown_workspace(slug)
        terminals.kill(slug)
    src.rename(dst)
    return FileEntry(
        name=dst.name,
        path=dst.resolve().relative_to(proj.resolve()).as_posix(),
        is_dir=dst.is_dir(),
    )


@router.post("/{slug}/files/move", response_model=FileEntry)
def move_entry(slug: str, body: MoveBody) -> FileEntry:
    proj = _project_dir(slug)
    src = _safe_path(proj, body.path)
    if src == proj.resolve() or not src.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    if src.name in _PROTECTED:
        raise HTTPException(status_code=403, detail="ย้ายไฟล์ระบบไม่ได้")
    dest_dir = _safe_path(proj, body.dest_dir) if body.dest_dir else proj.resolve()
    if not dest_dir.is_dir():
        raise HTTPException(status_code=400, detail="ไม่พบโฟลเดอร์ปลายทาง")
    if dest_dir == src.parent:
        raise HTTPException(status_code=400, detail="อยู่ในโฟลเดอร์นี้อยู่แล้ว")
    # refuse moving a folder into itself or one of its descendants
    if src.is_dir() and (dest_dir == src or src in dest_dir.parents):
        raise HTTPException(status_code=400, detail="ย้ายเข้าไปในตัวเองไม่ได้")
    dst = dest_dir / src.name
    if dst.exists():
        raise HTTPException(status_code=409, detail="มีชื่อนี้อยู่แล้วในปลายทาง")
    if src.name == "venv" and src.parent == proj.resolve():
        from app.routers.terminal import manager as terminals

        kernels.shutdown_workspace(slug)
        terminals.kill(slug)
    src.rename(dst)
    return FileEntry(
        name=dst.name,
        path=dst.resolve().relative_to(proj.resolve()).as_posix(),
        is_dir=dst.is_dir(),
    )


@router.get("/{slug}/files/abspath")
def file_abspath(slug: str, path: str = Query("")) -> dict:
    """Absolute path of a project file (for 'copy path'). Forward-slashed so it
    pastes straight into code (e.g. P:/PhoenixNest/.../bus.jpg) — works as a
    string literal on Windows without backslash-escaping."""
    proj = _project_dir(slug)
    target = _safe_path(proj, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    return {"path": target.as_posix()}


@router.delete("/{slug}/files")
def delete_entry(slug: str, path: str = Query(...)) -> dict:
    proj = _project_dir(slug)
    target = _safe_path(proj, path)
    if target == proj.resolve():
        raise HTTPException(status_code=400, detail="ลบรากโปรเจคไม่ได้")
    if not target.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    if target.name in _PROTECTED:
        raise HTTPException(status_code=403, detail="ลบไฟล์ระบบไม่ได้")
    # Releasing the venv requires stopping the kernel + terminal that hold it.
    if target.name == "venv" and target.parent == proj.resolve():
        from app.routers.terminal import manager as terminals

        kernels.shutdown_workspace(slug)
        terminals.kill(slug)
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"ok": True}


@router.delete("/{slug}")
def delete_project(slug: str) -> dict:
    from app.routers.terminal import manager as terminals

    proj = _project_dir(slug)
    # Stop kernel + terminal first so their venv files aren't locked (Windows rmtree).
    kernels.shutdown_workspace(slug)
    terminals.kill(slug)
    shutil.rmtree(proj)
    return {"ok": True}
