# Phoenix Nest — Python

Python module for the Phoenix Nest ecosystem. **v0.1.0** — full-stack scaffold
(Next.js frontend + FastAPI backend). The concrete purpose is still being
decided; this is the running shell to build on.

## Structure

```
python/
├── apps/
│   ├── web/     # Next.js frontend  (http://localhost:3200)
│   └── api/     # FastAPI backend   (http://localhost:8200)
└── start.bat    # launches both services
```

## Setup

Backend (once):

```bash
cd apps/api
python -m venv venv
venv\Scripts\pip install -r requirements.txt   # Windows
```

Frontend (once):

```bash
cd apps/web
pnpm install
```

## Run

One-shot launcher (Windows):

```bash
start.bat
```

Or run each service manually:

```bash
# backend
cd apps/api
set PYTHONPATH=%CD%
venv\Scripts\python -m uvicorn app.main:app --reload --port 8200

# frontend
cd apps/web
pnpm dev
```

- Frontend: http://localhost:3200
- API docs: http://localhost:8200/docs

The frontend pings `GET /api/info` and shows a live backend status badge in the
header.

## Endpoints

| Method | Path        | Description              |
|--------|-------------|--------------------------|
| GET    | `/health`   | Liveness probe           |
| GET    | `/api/info` | Runtime info (version, Python, platform) |

_Not yet wired into the Hub registry (`modules.json`) — runs standalone for now._
