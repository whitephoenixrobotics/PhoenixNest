"""Interactive terminal — a real PTY (PowerShell) per project, streamed over a
WebSocket. The project's venv is first on PATH so ``python``/``pip`` resolve to
it (``pip install`` lands in the project venv).

Sessions are *persistent*: closing the panel only detaches the WebSocket — the
shell keeps running in the background (long ``pip install`` etc. survive), and
reopening reattaches and replays the scrollback. Loopback-only, local trust.
"""

import asyncio
import json
import os
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app import workspaces
from app.paths import PROJECTS_DIR, find_venv_python

router = APIRouter(tags=["terminal"])


def _resolve_root(slug: str) -> Path | None:
    """Workspace id → opened folder, or legacy managed project dir."""
    ws = workspaces.get(slug)
    if ws:
        root = Path(ws["path"])
        return root if root.is_dir() else None
    proj = PROJECTS_DIR / slug
    if proj.is_dir() and (
        (proj / ".phoenix" / "project.json").exists()
        or (proj / "project.json").exists()
    ):
        return proj
    return None

_MAX_SCROLLBACK = 200_000  # chars of output kept for reattach


def _build_env(proj) -> dict:
    env = os.environ.copy()
    interp = find_venv_python(proj)  # venv/ or .venv/ if present
    if interp:
        scripts = interp.parent  # .../Scripts (Windows) or .../bin
        venv_dir = scripts.parent
        env["PATH"] = str(scripts) + os.pathsep + env.get("PATH", "")
        env["VIRTUAL_ENV"] = str(venv_dir)
    return env


class TerminalSession:
    """A long-lived PTY whose output is buffered and forwarded to whichever
    WebSocket is currently attached (at most one)."""

    def __init__(self, slug: str, cwd: str, env: dict):
        from winpty import PtyProcess

        self.slug = slug
        self.proc = PtyProcess.spawn(
            "powershell.exe -NoLogo", cwd=cwd, env=env, dimensions=(24, 80)
        )
        self.scrollback = ""
        self.attached: WebSocket | None = None
        self.lock = asyncio.Lock()
        self.alive = True
        # capture the loop so kill() (callable from a threadpool thread) can
        # cancel the reader task safely
        self._loop = asyncio.get_running_loop()
        self.reader = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        while True:
            try:
                data = await asyncio.to_thread(self.proc.read, 1024)
            except EOFError:
                break
            if not data:
                if not self.proc.isalive():
                    break
                continue
            # Append + live-forward atomically so reattach can't duplicate or
            # reorder a chunk relative to the scrollback snapshot.
            async with self.lock:
                self.scrollback = (self.scrollback + data)[-_MAX_SCROLLBACK:]
                if self.attached:
                    try:
                        await self.attached.send_text(data)
                    except Exception:  # noqa: BLE001
                        self.attached = None
        self.alive = False
        async with self.lock:
            if self.attached:
                try:
                    await self.attached.send_text("\r\n\x1b[90m[session ended]\x1b[0m\r\n")
                except Exception:  # noqa: BLE001
                    pass
        _manager.drop(self.slug, self)

    async def attach(self, ws: WebSocket) -> None:
        async with self.lock:
            self.attached = ws
            if self.scrollback:
                try:
                    await ws.send_text(self.scrollback)
                except Exception:  # noqa: BLE001
                    self.attached = None

    async def detach(self, ws: WebSocket) -> None:
        async with self.lock:
            if self.attached is ws:
                self.attached = None

    async def clear(self) -> None:
        async with self.lock:
            self.scrollback = ""

    def write(self, data: str) -> None:
        try:
            self.proc.write(data)
        except Exception:  # noqa: BLE001
            pass

    def resize(self, rows: int, cols: int) -> None:
        try:
            self.proc.setwinsize(rows, cols)
        except Exception:  # noqa: BLE001
            pass

    def kill(self) -> None:
        self.alive = False
        try:
            self.proc.terminate(force=True)
        except Exception:  # noqa: BLE001
            pass
        # kill() may be called from a threadpool thread (sync routes) — cancel
        # the reader task on its own loop, not from this thread.
        task = self.reader
        if task and not task.done():
            try:
                self._loop.call_soon_threadsafe(task.cancel)
            except RuntimeError:
                task.cancel()


class TerminalManager:
    def __init__(self) -> None:
        self._sessions: dict[str, TerminalSession] = {}

    def get_or_create(self, slug: str, cwd: str, env: dict) -> TerminalSession | None:
        s = self._sessions.get(slug)
        if s and s.alive and s.proc.isalive():
            return s
        try:
            s = TerminalSession(slug, cwd, env)
        except ImportError:
            return None
        self._sessions[slug] = s
        return s

    def drop(self, slug: str, session: "TerminalSession") -> None:
        if self._sessions.get(slug) is session:
            del self._sessions[slug]

    def kill(self, slug: str) -> None:
        s = self._sessions.pop(slug, None)
        if s:
            s.kill()


_manager = TerminalManager()
manager = _manager  # public alias (e.g. for project deletion)


@router.websocket("/api/projects/{slug}/terminal/ws")
async def terminal_ws(ws: WebSocket, slug: str) -> None:
    await ws.accept()
    proj = _resolve_root(slug)
    if proj is None:
        await ws.close(code=4404)
        return

    session = _manager.get_or_create(slug, str(proj), _build_env(proj))
    if session is None:
        await ws.send_text("\r\n[terminal] pywinpty ไม่ได้ติดตั้ง\r\n")
        await ws.close()
        return

    await session.attach(ws)
    try:
        while True:
            obj = json.loads(await ws.receive_text())
            if obj.get("type") == "input":
                session.write(obj.get("data", ""))
            elif obj.get("type") == "clear":
                await session.clear()
            elif obj.get("type") == "resize":
                try:
                    session.resize(int(obj["rows"]), int(obj["cols"]))
                except Exception:  # noqa: BLE001
                    pass
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        await session.detach(ws)


@router.post("/api/projects/{slug}/terminal/kill")
def terminal_kill(slug: str) -> dict:
    """Force-terminate the persistent shell. The next WS connect starts fresh."""
    _manager.kill(slug)
    return {"ok": True}
