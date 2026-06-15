"""Entry point for the bundled PhoenixPy backend.

The Hub runs this with the **bundled Python** (NOT a PyInstaller exe like Flow):
PhoenixPy executes the user's Python — kernels, `python -m venv`, scripts — which
needs a real interpreter, so the module bundle ships a Python and launches:

    <bundle>/api/runtime/Scripts/python.exe -m … phoenix_py_entry   (see module.json)

Reads PHOENIX_API_PORT / PHOENIX_API_HOST (the Hub picks a port at launch) and
serves the FastAPI app without uvicorn's reloader.
"""

import os
import sys


def main() -> None:
    # Keep app data (workspaces.json / ai.json) in a per-user dir so it survives
    # module updates — the bundle folder is replaced on update. app/paths.py
    # honors PHOENIXPY_DATA_DIR.
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        default_data = os.path.join(base, "PhoenixPy")
    else:
        default_data = os.path.join(os.path.expanduser("~"), ".phoenixpy")
    os.environ.setdefault("PHOENIXPY_DATA_DIR", default_data)
    os.makedirs(os.environ["PHOENIXPY_DATA_DIR"], exist_ok=True)

    host = os.environ.get("PHOENIX_API_HOST", "127.0.0.1")
    port = int(os.environ.get("PHOENIX_API_PORT", "8200"))

    import uvicorn

    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
