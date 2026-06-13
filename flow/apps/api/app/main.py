from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
# Auth + admin now live in Supabase (frontend). The backend only verifies
# Supabase access tokens — no local login/admin routers.
from app.routers.projects import router as projects_router
from app.routers.flows import router as flows_router
from app.routers.models import router as models_router
from app.routers.train import router as train_router
from app.routers.train_detect import router as train_detect_router
from app.routers.stt import router as stt_router
from app.routers.sheets import router as sheets_router
from app.routers.native import router as native_router
from app.routers.arduino import router as arduino_router, ws_router as arduino_ws_router
from app.routers.line import router as line_router
from app.websocket.execution_ws import router as ws_router
from app.websocket.preview_ws import router as preview_ws_router
from app.websocket.native_ws import router as native_ws_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(flows_router)
app.include_router(models_router)
app.include_router(train_router)
app.include_router(train_detect_router)
app.include_router(stt_router)
app.include_router(sheets_router)
app.include_router(native_router)
app.include_router(arduino_router)
app.include_router(arduino_ws_router)
app.include_router(line_router)
app.include_router(ws_router)
app.include_router(preview_ws_router)
app.include_router(native_ws_router)


@app.on_event("startup")
async def _startup() -> None:
    # Create tables on first run (SQLite path — Alembic still works for Postgres).
    await init_db()

    # Move a v0.2.0-style in-install storage/ to the per-user data dir once, so
    # upgrading users keep their uploaded models + TrainAI projects.
    from app.paths import migrate_legacy_storage
    try:
        if migrate_legacy_storage():
            print("[storage] migrated legacy storage/ → per-user data dir", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[storage] migration skipped: {e}", flush=True)

    # Recover training projects left in status="training" by a previous
    # crash/quit — otherwise they 409 ("กำลังเทรนอยู่แล้ว") forever.
    from app.routers.train import reset_interrupted_trainings
    try:
        reset_interrupted_trainings()
    except Exception as e:  # noqa: BLE001
        print(f"[train] interrupted-training sweep failed: {e}", flush=True)

    # Warm up the default YOLO model (and the CUDA context) in the background
    # so the first Run/Live doesn't stall for several seconds. Daemon thread —
    # never blocks startup or shutdown. Skipped in dev (PHOENIX_DEV=1 set by
    # start.bat) so uvicorn --reload restarts stay fast.
    import os
    import threading

    if os.environ.get("PHOENIX_DEV"):
        print("[warmup] skipped (dev mode)", flush=True)
        return

    def _warmup() -> None:
        try:
            from PIL import Image
            from app.engine.nodes.ai.detect import _get_model, _get_device, _use_half
            model = _get_model("yolov8n.pt")
            model(Image.new("RGB", (640, 640)), verbose=False,
                  device=_get_device(), half=_use_half())
            print("[warmup] YOLO ready", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[warmup] skipped: {e}", flush=True)

    threading.Thread(target=_warmup, daemon=True).start()


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}
