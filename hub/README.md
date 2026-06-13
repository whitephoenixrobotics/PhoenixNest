# Phoenix Nest Hub

Central desktop control panel for the Phoenix Nest ecosystem. Built with Electron + React + TypeScript.

It reads the repo-root `modules.json` and renders each registered module as a card with an **Open** button (enabled for `active` modules that declare a `launch` command).

## Structure

```
hub/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # window mgmt + IPC: get-modules, open-module, open-url
│   │   └── preload.ts     # exposes window.phoenixHub to the renderer
│   └── renderer/          # React UI
│       ├── App.tsx        # loads modules.json, renders cards + Open buttons
│       ├── types.ts       # shared types + window.phoenixHub typing
│       ├── main.tsx
│       └── index.html
├── package.json
├── tsconfig.json          # renderer (ESNext)
├── tsconfig.main.json     # main process (CommonJS)
└── vite.config.ts
```

## How it works

1. On launch the main process reads `../modules.json` (repo root).
2. `App.tsx` calls `window.phoenixHub.getModules()` and renders a card per module.
3. Clicking **Open** calls `window.phoenixHub.openModule(id)`, which spawns the
   module's `launch.command` in its `launch.cwd` (detached), then opens its `url`
   in the browser if one is set.

## Setup

```bash
cd hub
npm install
npm run build      # build:renderer (vite) + build:main (tsc)
npm run electron   # launch the built app
# or, for development with hot-reload:
npm run dev        # vite renderer + tsc --watch for main
```

## Troubleshooting

**`Electron failed to install correctly`** — Electron's prebuilt binary
postinstall (`extract-zip`) can fail on some Windows setups, leaving
`node_modules/electron/dist` empty. Fix by extracting the cached zip manually:

```powershell
$zip = (Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter *.zip)[0].FullName
Expand-Archive $zip -DestinationPath node_modules\electron\dist -Force
"electron.exe" | Set-Content -NoNewline node_modules\electron\path.txt
```
