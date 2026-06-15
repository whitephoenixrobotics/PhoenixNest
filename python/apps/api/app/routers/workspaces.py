"""Workspace endpoints — open a folder (VS Code style), list recents, and a
native folder picker dialog served by the local backend.
"""

import asyncio
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import workspaces
from app.paths import PROJECTS_DIR, find_venv_python

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

VENV_TIMEOUT = 180.0


class OpenBody(BaseModel):
    path: str


class CreateBody(BaseModel):
    name: str
    parent: str = ""  # empty → default projects dir (data/projects/)


class WorkspaceInfo(BaseModel):
    id: str
    path: str
    name: str
    has_venv: bool = False
    python_version: str = ""


def _info(rec: dict) -> WorkspaceInfo:
    root = Path(rec["path"])
    return WorkspaceInfo(
        id=rec["id"],
        path=rec["path"],
        name=rec["name"],
        has_venv=find_venv_python(root) is not None,
        python_version=platform.python_version(),
    )


def _pick_folder_blocking() -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        path = filedialog.askdirectory(title="เลือกโฟลเดอร์ — Phoenix Nest")
    finally:
        root.destroy()
    return path or None


def _ensure_venv(root: Path) -> bool:
    if find_venv_python(root):
        return True
    subprocess.run(
        [sys.executable, "-m", "venv", str(root / ".venv")],
        capture_output=True,
        timeout=VENV_TIMEOUT,
    )
    return find_venv_python(root) is not None


@router.get("", response_model=list[WorkspaceInfo])
def list_workspaces() -> list[WorkspaceInfo]:
    return [_info(w) for w in workspaces.recents()]


@router.post("/pick")
async def pick_folder() -> dict:
    """Open a native folder dialog on the server machine; return chosen path."""
    try:
        path = await asyncio.to_thread(_pick_folder_blocking)
    except Exception as exc:  # noqa: BLE001 — tkinter may be unavailable
        raise HTTPException(status_code=500, detail=f"เปิด dialog ไม่ได้: {exc}")
    return {"path": path}


@router.post("/open", response_model=WorkspaceInfo)
async def open_workspace(body: OpenBody) -> WorkspaceInfo:
    root = Path(body.path.strip())
    if not root.is_dir():
        raise HTTPException(status_code=400, detail="ไม่พบโฟลเดอร์นี้")
    rec = workspaces.remember(
        str(root), datetime.now(timezone.utc).isoformat()
    )
    # Keep the venv model: use existing venv/.venv, otherwise create .venv.
    await asyncio.to_thread(_ensure_venv, root.resolve())
    return _info(rec)


@router.post("/create", response_model=WorkspaceInfo)
async def create_workspace(body: CreateBody) -> WorkspaceInfo:
    if body.parent.strip():
        parent = Path(body.parent.strip())
    else:
        # Default: managed projects dir (data/projects/).
        parent = PROJECTS_DIR
        parent.mkdir(parents=True, exist_ok=True)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="ไม่พบโฟลเดอร์ปลายทาง")
    name = body.name.strip().strip("/\\")
    if not name or name in (".", ".."):
        raise HTTPException(status_code=400, detail="ชื่อไม่ถูกต้อง")
    root = parent / name
    if root.exists():
        raise HTTPException(status_code=409, detail="มีโฟลเดอร์นี้อยู่แล้ว")
    root.mkdir(parents=True)
    _scaffold(root, name)
    rec = workspaces.remember(str(root), datetime.now(timezone.utc).isoformat())
    await asyncio.to_thread(_ensure_venv, root.resolve())
    return _info(rec)


def _scaffold(root: Path, name: str) -> None:
    """Starter files for a freshly created folder (not for opening existing)."""
    # Imported lazily to avoid any router import-order coupling.
    from app.routers.projects import DEFAULT_CELLS, _cells_to_ipynb

    (root / "main.ipynb").write_text(
        json.dumps(
            _cells_to_ipynb(DEFAULT_CELLS, platform.python_version()),
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    (root / "requirements.txt").write_text("", encoding="utf-8")
    (root / "readme.txt").write_text(f"{name}\n", encoding="utf-8")


@router.get("/{wsid}", response_model=WorkspaceInfo)
def get_workspace(wsid: str) -> WorkspaceInfo:
    rec = workspaces.get(wsid)
    if not rec or not Path(rec["path"]).is_dir():
        raise HTTPException(status_code=404, detail="ไม่พบ workspace")
    return _info(rec)


@router.delete("/{wsid}")
def close_workspace(wsid: str) -> dict:
    # Only forgets it from recents — the folder on disk is left untouched.
    workspaces.forget(wsid)
    return {"ok": True}
