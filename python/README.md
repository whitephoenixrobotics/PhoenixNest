# Phoenix Nest — Python

**v0.1.0** — a local Python IDE for the Phoenix Nest ecosystem: open any folder
and work in a Jupyter-style **notebook**, a **code editor** (lint / format /
autocomplete), an integrated **terminal**, and an **AI assistant** — all running
locally. Designed to embed in the Hub Electron app (like `flow`), but each half
also runs standalone for development.

## Structure

```
python/
├── apps/
│   ├── web/     # Next.js frontend  (http://localhost:3200)
│   └── api/     # FastAPI backend   (http://127.0.0.1:8200)
└── start.bat    # launches both services
```

> The backend binds **127.0.0.1** (IPv4), not `localhost` — on Windows the
> browser may resolve `localhost` to IPv6 `::1` first, which uvicorn isn't
> listening on.

## Setup

Backend (once):

```bat
cd apps\api
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

Frontend (once):

```bat
cd apps\web
pnpm install
```

## Run

One-shot launcher (Windows) — starts both services:

```bat
start.bat
```

Or run each service manually:

```bat
:: backend
cd apps\api
set PYTHONPATH=%CD%
venv\Scripts\python -m uvicorn app.main:app --reload --port 8200

:: frontend
cd apps\web
pnpm dev
```

- App: http://localhost:3200
- API docs: http://127.0.0.1:8200/docs

## What it does

- **Notebook** — persistent per-file kernel, inline plots/HTML, interactive
  `input()`, table-of-contents, run-by-section, undo/redo, find & replace.
- **Editor** — CodeMirror with Ruff lint/format and Jedi autocomplete; `.py`
  files run with interactive stdin; `.md` files get a live preview.
- **Terminal** — a real PowerShell PTY per workspace, with the workspace venv on
  `PATH` (so `pip install` lands in the venv). Sessions persist across detach.
- **AI assistant** — local Ollama models (Qwen2.5-Coder) or external APIs
  (Claude / Gemini / OpenAI-compatible); chat + one-click "explain / fix error".

## API surface

The backend mounts these router groups (see `/docs` for the full schema):

| Prefix | Purpose |
|--------|---------|
| `/api/workspaces` | open / create / list opened folders |
| `/api/projects/{id}` | files, notebook, kernel, packages, run |
| `/api/projects/{id}/terminal/ws` | terminal PTY (WebSocket) |
| `/api/ai` | assistant status, model pull/select, chat, fix |
| `/api/tools` | lint / format helpers |
| `/health`, `/api/info` | liveness + runtime info |

_Not yet wired into the Hub registry (`modules.json`) — runs standalone for now._
