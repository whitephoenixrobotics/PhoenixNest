import asyncio
import platform
import socket
import sys
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.paths import ensure_dirs
from app.routers.ai import router as ai_router
from app.routers.projects import router as projects_router
from app.routers.run import router as run_router
from app.routers.terminal import router as terminal_router
from app.routers.tools import router as tools_router
from app.routers.workspaces import router as workspaces_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.on_event("startup")
async def _startup() -> None:
    ensure_dirs()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(run_router)
app.include_router(projects_router)
app.include_router(terminal_router)
app.include_router(tools_router)
app.include_router(workspaces_router)
app.include_router(ai_router)


@app.get("/health")
async def health() -> dict:
    """Liveness probe (used by the launcher to wait for the backend)."""
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/api/info")
async def info() -> dict:
    """Basic runtime info about the PhoenixPy backend."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "python": sys.version.split()[0],
        "platform": platform.system(),
    }


# Real internet reachability — distinct from /health (local) and the AI-status
# `online` flag (a loopback check for the Ollama daemon). navigator.onLine in
# the browser only knows if a network interface is up, not whether traffic can
# actually leave the LAN, so the UI relies on this server-side probe to gate
# download actions (model pull, pip, external APIs). Probed from the same host
# that performs those downloads, with a short cache to stay cheap.
_NET_CACHE: dict = {"ts": 0.0, "ok": True}
_NET_TTL = 3.0  # short so the UI reflects a dropped connection within seconds
_NET_HOSTS = (("1.1.1.1", 443), ("8.8.8.8", 443))  # IP:port → no DNS dependency


def _internet_reachable() -> bool:
    now = time.monotonic()
    if now - _NET_CACHE["ts"] < _NET_TTL:
        return _NET_CACHE["ok"]
    ok = False
    for host in _NET_HOSTS:
        try:
            with socket.create_connection(host, timeout=1.5):
                ok = True
                break
        except OSError:
            continue
    _NET_CACHE.update(ts=now, ok=ok)
    return ok


@app.get("/api/net")
async def net_status() -> dict:
    """Best-effort: can this machine reach the internet right now?"""
    return {"online": await asyncio.to_thread(_internet_reachable)}
