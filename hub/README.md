# PhoenixNest

The ecosystem **shell** — a lightweight desktop app (Next.js + Electron + Supabase)
that is the single entry point to everything in Phoenix Nest.

It is intentionally small: **login + a module hub**. Modules (AI Flow, Circuit,
Python tools) are *not* bundled — the user installs them on demand from the hub.

## Flow

```
Login (Google / Supabase)  →  Hub (module picker, "+" to add)  →  open an installed module
```

- Reuses the **same Supabase project as Flow**, so one Google login works across
  the whole ecosystem.
- Auth mirrors Flow's desktop pattern: the system browser does the Google OAuth,
  Supabase redirects to the Electron loopback (`127.0.0.1:53682`), which forwards
  the `?code` into the app window to finish the PKCE exchange.

## Structure

```
hub/
├── electron/
│   ├── main.js        # window + OAuth loopback server (port 53682)
│   └── preload.js     # exposes window.phoenixNest to the renderer
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx   # Google sign-in
│   │   ├── auth/callback/page.tsx  # finishes the OAuth session
│   │   ├── page.tsx                # the Hub (guarded — redirects to /login)
│   │   └── layout.tsx, globals.css
│   ├── components/
│   │   ├── HubView.tsx             # module grid + "+" add dialog
│   │   ├── GoogleSignInButton.tsx
│   │   └── Logo.tsx
│   └── lib/
│       ├── supabase.ts             # Supabase client (PKCE)
│       ├── auth.ts                 # session helpers
│       ├── desktop.ts              # window.phoenixNest bridge
│       └── modules.ts              # module catalog
└── .env.local                      # NEXT_PUBLIC_SUPABASE_* (gitignored)
```

## Setup

```bash
cd hub
npm install
npm run dev      # Next dev server + Electron window (via concurrently + wait-on)
```

Or just double-click `start.bat`.

## Status

Phase 0 — shell works: login → hub → pick/install (simulated) → module card.
Real module download/install and in-window module embedding come next.
