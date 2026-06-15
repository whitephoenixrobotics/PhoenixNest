# PhoenixPy Desktop (Electron shell)

A desktop wrapper around the PhoenixPy web app, so it runs as a native window
instead of a browser tab.

## Status

- **Step 1 — dev shell (now):** opens the running dev servers in a desktop
  window. ✅
- **Step 2 — packaged app (next):** detect/download a Python runtime, bootstrap
  the backend venv, and spawn the bundled backend + Next standalone server
  itself (no manual `start.bat`). _In progress._

## Run (dev)

The desktop shell just displays the app — you still run the servers separately
in dev.

```bat
:: 1) start backend + frontend (from python/)
start.bat

:: 2) launch the desktop window (from python/apps/desktop/)
pnpm install      ::  once — downloads Electron
pnpm start
```

The window points at `http://localhost:3200`. Override with `PHOENIX_APP_URL`
if your frontend runs elsewhere.

## How the backend URL is resolved

The frontend's `api.ts` reads `window.__PHOENIX_API_URL__` (injected by
`preload.js`) and otherwise falls back to `http://127.0.0.1:8200`. So in dev no
injection is needed; in the packaged build the main process will set
`PHOENIX_API_URL` to the bundled backend's actual port.

## Packaging (Step 2 — planned)

Because PhoenixPy runs the user's Python (kernels, venv creation, `python -m`),
the backend can **not** be PyInstaller-frozen (that would make `sys.executable`
point at the app, not a real interpreter). Instead the packaged app will:

1. Find a usable Python on the machine (`py -3` / `python`).
2. If none is found, download a standalone Python build automatically.
3. Create a backend venv and `pip install -r requirements.txt` on first run.
4. Spawn `…/python -m uvicorn app.main:app` + the Next standalone `server.js`
   on free ports, then point the window at them.
