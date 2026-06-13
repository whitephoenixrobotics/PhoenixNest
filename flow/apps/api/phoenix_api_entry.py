"""Frozen entry point for the Phoenix Flow backend.

This is what PyInstaller compiles into `phoenix-api.exe`. Reads PHOENIX_API_PORT
from the environment (Electron sets it to a free port at launch) and serves the
FastAPI app directly without uvicorn's reloader.
"""
import os
import sys
import multiprocessing


def _user_data_dir() -> str:
    """Per-user writable dir for the SQLite DB + downloaded models.

    On Windows that's %LOCALAPPDATA%\\PhoenixFlow. We override DATABASE_URL +
    XDG_CACHE_HOME (HuggingFace model cache) before the app is imported.
    """
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "PhoenixFlow")
    return os.path.join(os.path.expanduser("~"), ".phoenixflow")


def main() -> None:
    multiprocessing.freeze_support()  # Windows + frozen subprocesses (DataLoader, etc.)

    data_dir = _user_data_dir()
    os.makedirs(data_dir, exist_ok=True)

    os.environ.setdefault(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{os.path.join(data_dir, 'phoenix.db').replace(os.sep, '/')}",
    )
    # File-based storage (uploaded models + TrainAI datasets) lives under the
    # same per-user dir, so it survives uninstall/update. app/paths.py reads this.
    os.environ.setdefault("PHOENIX_DATA_DIR", data_dir)
    # HuggingFace + Torch caches → per-user dir so users without admin rights work too.
    cache_dir = os.path.join(data_dir, "cache")
    os.environ.setdefault("HF_HOME", cache_dir)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", cache_dir)
    os.environ.setdefault("XDG_CACHE_HOME", cache_dir)
    os.environ.setdefault("TORCH_HOME", os.path.join(cache_dir, "torch"))

    host = os.environ.get("PHOENIX_API_HOST", "127.0.0.1")
    port = int(os.environ.get("PHOENIX_API_PORT", "8000"))

    import uvicorn
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
