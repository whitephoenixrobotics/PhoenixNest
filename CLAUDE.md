# Phoenix Nest Ecosystem

A monorepo housing all Phoenix Nest projects — a unified platform for AI-powered automation, desktop integration, and smart home control.

## Structure

```
PhoenixNest/
├── hub/        # Electron desktop app — central control panel for the ecosystem
├── flow/       # PhoenixFlow — AI task automation backend (FastAPI + Electron)
├── python/     # Shared Python packages and scripts
├── circuit/    # IoT / hardware integration layer
├── CLAUDE.md   # This file
└── modules.json  # Ecosystem module registry
```

## Modules

| Module | Path | Stack | Purpose |
|--------|------|-------|---------|
| hub | `hub/` | Electron, React, TypeScript | Desktop control panel |
| flow | `flow/` | FastAPI, SQLite, Electron | AI task automation |
| python | `python/` | Python 3.x | Shared Python utilities |
| circuit | `circuit/` | TBD | IoT / hardware integration |

## Module Registry

`modules.json` at the root tracks all registered modules, their versions, and inter-module dependencies. Update it when adding a new module or changing a cross-module API.

## Development

Each module is independently runnable. See `<module>/README.md` for module-specific setup.

### Prerequisites
- Node.js 18+
- Python 3.10+
- pnpm (for flow/)

## Cross-Module Communication

Modules communicate via:
- **Local HTTP** — flow/ exposes a FastAPI server on `localhost:8000`
- **IPC** — hub/ uses Electron IPC for renderer↔main communication
- **Shared config** — `modules.json` acts as the runtime service registry

## Naming Conventions

- Module directories: lowercase, single word (`hub`, `flow`, `python`, `circuit`)
- Branches: `<module>/<feature>` (e.g., `hub/sidebar-nav`, `flow/task-queue`)
- Commits: `<module>: <description>` (e.g., `hub: add settings panel`)
