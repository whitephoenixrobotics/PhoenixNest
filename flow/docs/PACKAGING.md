# Phoenix Flow — Standalone Packaging Guide

How the desktop installer is built, how to rebuild it, and how it works at runtime.

## What's in the installer

| Component | Source | Bundled as |
|-----------|--------|-----------|
| Electron shell | `apps/desktop/src/` | `Phoenix Flow.exe` |
| Backend (FastAPI + AI) | `apps/api/` | `resources/phoenix-api/phoenix-api.exe` |
| Frontend (Next.js) | `apps/web/` | `resources/web/server.js` (Next standalone) |
| Database | created at runtime | `%LOCALAPPDATA%\PhoenixFlow\phoenix.db` (SQLite) |
| Model cache | downloaded at first use | `%LOCALAPPDATA%\PhoenixFlow\cache\` |

**No external dependencies needed** — Python, Node.js, Docker, Postgres are all
bundled or replaced (SQLite). User signs in with Google via Supabase.

## Runtime architecture

```
Phoenix Flow.exe                      (Electron main)
  ├─ spawns phoenix-api.exe :<free>   (FastAPI + AI stack — PyInstaller bundle)
  ├─ spawns ELECTRON_RUN_AS_NODE      (Next standalone server, also :<free>)
  ├─ loopback :53682                  (Supabase OAuth redirect)
  └─ loads http://127.0.0.1:<web>     (in the renderer)
```

Ports are picked dynamically at launch (`services.startBackend/startFrontend`)
so multiple instances or other dev servers don't collide.

## Build prerequisites

- Node 20+, pnpm
- Python 3.13 + venv at `apps/api/venv` with `pip install -r requirements.txt`
- PyInstaller (`venv\Scripts\python.exe -m pip install pyinstaller`)
- (For NSIS installer) **Windows Developer Mode ON** —
  Settings → Privacy & security → For developers → Developer Mode
  (electron-builder extracts code-signing tools that contain symlinks)
- ~12 GB free disk for the build (final installer ~5 GB)

## Build steps

```bat
:: 1. Backend bundle (~10-15 min, ~5 GB output)
cd apps\api
venv\Scripts\python.exe -m PyInstaller --clean -y phoenix-api.spec
:: → apps/api/dist/phoenix-api/phoenix-api.exe

:: 2. Frontend standalone (~30 s)
cd ..\web
pnpm build
:: Next standalone is missing static + public — copy them in:
xcopy /E /I /Y .next\static .next\standalone\apps\web\.next\static
xcopy /E /I /Y public .next\standalone\apps\web\public

:: 3. Installer (~5-10 min)
cd ..\desktop
pnpm dist:win
:: → apps/desktop/dist/Phoenix Flow Setup 0.1.0.exe
:: → apps/desktop/dist/win-unpacked/Phoenix Flow.exe (portable)
```

If the NSIS step fails with "Cannot create symbolic link", enable Developer Mode
and rerun — the `win-unpacked` folder is still produced and is fully runnable.

## Updating

Bump `apps/desktop/package.json#version`, rebuild, then publish:

```bat
set GH_TOKEN=ghp_...
cd apps\desktop
pnpm publish
```

This uploads the installer + a `latest.yml` manifest to GitHub Releases.
Installed apps check that manifest on startup via `electron-updater`.

## Where the user's data lives

| What | Path |
|------|------|
| SQLite DB | `%LOCALAPPDATA%\PhoenixFlow\phoenix.db` |
| HuggingFace model cache | `%LOCALAPPDATA%\PhoenixFlow\cache\` |
| TrainAI projects (datasets, weights) | bundled into `LOCALAPPDATA` on first run — TODO move out of `apps/api/storage` |

To reset a user back to a clean state: close the app and delete
`%LOCALAPPDATA%\PhoenixFlow\`.
