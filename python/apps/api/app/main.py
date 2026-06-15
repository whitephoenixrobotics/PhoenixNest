import platform
import sys

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
    """Basic runtime info about the Python backend."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "python": sys.version.split()[0],
        "platform": platform.system(),
    }
