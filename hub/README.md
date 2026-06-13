# Phoenix Nest Hub

Central desktop control panel for the Phoenix Nest ecosystem. Built with Electron + React + TypeScript.

## Structure

```
hub/
├── src/
│   ├── main/         # Electron main process
│   │   ├── index.ts  # App entry, window management
│   │   └── preload.ts
│   └── renderer/     # React UI
│       ├── App.tsx
│       ├── main.tsx
│       └── index.html
├── package.json
├── tsconfig.json
├── tsconfig.main.json
└── vite.config.ts
```

## Setup

```bash
cd hub
npm install
npm run dev       # renderer hot-reload + main process watch
npm run electron  # launch Electron (after build)
```
