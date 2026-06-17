'use strict'

const { app, BrowserWindow, shell, ipcMain, net, session } = require('electron')
const path = require('path')
const http = require('http')
const https = require('https')
const { autoUpdater } = require('electron-updater')
const services = require('./services')

// Edition is baked into package.json `name` at build time:
//   phoenix-desktop      → CPU edition (default)
//   phoenix-desktop-gpu  → GPU edition (electron-builder --extraMetadata.name override)
// Used in the window title and surfaced to the renderer for a UI badge.
const EDITION = (require('../package.json').name === 'phoenix-desktop-gpu') ? 'GPU' : 'CPU'
const WINDOW_TITLE = `PhoenixFlow · ${EDITION}`

// ── Configuration (override via env when packaging / deploying) ──────────────
// In dev these default to the user's local dev servers (start.bat). In a
// packaged build we spawn the bundled backend + frontend ourselves and
// overwrite APP_URL / AUTH_URL with the chosen ports before loading.
let APP_URL = process.env.PHOENIX_APP_URL || 'http://localhost:3000'
let AUTH_URL = process.env.PHOENIX_AUTH_URL || 'http://localhost:8000'
const healthUrl = () => `${AUTH_URL.replace(/\/$/, '')}/health`
const PROTOCOL = 'phoenixflow'
// Loopback port the backend redirects the desktop OAuth token to. Must match
// DESKTOP_LOOPBACK_PORT in apps/api/.env.
const LOOPBACK_PORT = parseInt(process.env.PHOENIX_LOOPBACK_PORT || '53682', 10)

let mainWindow = null
let pendingDeepLink = null
let loopbackServer = null

// ── Single-instance lock (required for deep links on Windows/Linux) ──────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux deliver the deep link as an argv entry on the 2nd launch.
    const link = argv.find((a) => a.startsWith(`${PROTOCOL}://`))
    if (link) handleDeepLink(link)
    focusWindow()
  })
}

// Register as the handler for phoenixflow:// links.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// macOS deep-link delivery.
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// ── Connectivity check ───────────────────────────────────────────────────────
function checkOnline() {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (!settled) {
        settled = true
        resolve(ok)
      }
    }
    try {
      const lib = healthUrl().startsWith('https') ? https : http
      const req = lib.get(healthUrl(), { timeout: 5000 }, (res) => {
        finish(res.statusCode >= 200 && res.statusCode < 500)
        res.resume()
      })
      req.on('timeout', () => {
        req.destroy()
        finish(false)
      })
      req.on('error', () => finish(false))
    } catch {
      finish(false)
    }
  })
}

// ── Windows ──────────────────────────────────────────────────────────────────
function focusWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: WINDOW_TITLE,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Pin the edition into the title — Next.js sets <title> on every nav, which
  // would otherwise wipe out "· GPU"/"· CPU".
  mainWindow.on('page-title-updated', (e, pageTitle) => {
    e.preventDefault()
    const base = pageTitle && pageTitle !== 'PhoenixFlow' ? `${pageTitle} — PhoenixFlow` : 'PhoenixFlow'
    mainWindow.setTitle(`${base} · ${EDITION}`)
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Open external links (target=_blank) in the system browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  loadApp()
}

async function loadApp() {
  const online = await checkOnline()
  if (!online) {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'))
    return
  }
  mainWindow.loadURL(APP_URL)
  // If a deep link arrived before the window existed, process it now.
  if (pendingDeepLink) {
    const link = pendingDeepLink
    pendingDeepLink = null
    handleDeepLink(link)
  }
}

// ── Drive the renderer to the OAuth callback route ───────────────────────────
// Forwards the raw query (Supabase PKCE ?code=...) into the app window, where
// supabase-js (detectSessionInUrl) finishes the exchange using the verifier it
// stored in this same renderer's localStorage.
function forwardToCallback(search) {
  if (!mainWindow) return
  focusWindow()
  const target = `${APP_URL.replace(/\/$/, '')}/auth/callback${search || ''}`
  console.log('[phoenix] forwarding OAuth callback to window')
  mainWindow.loadURL(target)
}

// ── Primary desktop OAuth path: loopback HTTP server ──────────────────────────
// Supabase redirects the external browser to http://127.0.0.1:<port>/auth/callback?code=...
// We forward that into the app window to complete sign-in.
function startLoopbackServer() {
  if (loopbackServer) return
  loopbackServer = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, `http://127.0.0.1:${LOOPBACK_PORT}`)
      if (u.pathname === '/auth/callback' || u.pathname === '/cb') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(LOOPBACK_SUCCESS_HTML)
        console.log('[phoenix] loopback received OAuth redirect, forwarding to window')
        forwardToCallback(u.search)
        return
      }
      res.writeHead(404)
      res.end()
    } catch {
      res.writeHead(400)
      res.end()
    }
  })
  loopbackServer.on('error', (e) => console.error('[phoenix] loopback server error:', e.message))
  loopbackServer.listen(LOOPBACK_PORT, '127.0.0.1', () =>
    console.log(`[phoenix] loopback listening on 127.0.0.1:${LOOPBACK_PORT}`),
  )
}

const LOOPBACK_SUCCESS_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>เข้าสู่ระบบสำเร็จ</title><style>
body{background:#09090b;color:#e4e4e7;font-family:system-ui,sans-serif;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:360px}h1{font-size:20px;color:#fff}p{color:#a1a1aa;font-size:14px}
.d{width:56px;height:56px;border-radius:50%;background:rgba(124,58,237,.15);color:#a78bfa;
display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px}
</style></head><body><div class="c"><div class="d">✓</div>
<h1>เข้าสู่ระบบสำเร็จ</h1><p>กลับไปที่แอป PhoenixFlow ได้เลย — ปิดแท็บนี้ได้</p>
<script>setTimeout(function(){window.close()},1500)</script></div></body></html>`

// ── Custom-protocol deep link (legacy fallback) ──────────────────────────────
function handleDeepLink(link) {
  try {
    const u = new URL(link)
    if (u.hostname !== 'auth') return
    if (!mainWindow) {
      pendingDeepLink = link
      return
    }
    forwardToCallback(u.search)
  } catch {
    /* ignore malformed links */
  }
}

// ── IPC from preload ──────────────────────────────────────────────────────────
ipcMain.handle('phoenix:get-version', () => app.getVersion())
ipcMain.on('phoenix:get-version-sync', (e) => {
  e.returnValue = app.getVersion()
})
ipcMain.on('phoenix:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})
ipcMain.on('phoenix:check-updates', () => {
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {})
})
ipcMain.on('phoenix:quit-and-install', () => autoUpdater.quitAndInstall())
ipcMain.handle('phoenix:check-online', () => checkOnline())
ipcMain.handle('phoenix:reload-app', () => loadApp())

// ── Auto-update wiring ─────────────────────────────────────────────────────────
function sendUpdate(info) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('phoenix:update', info)
  }
}

autoUpdater.autoDownload = true
autoUpdater.on('checking-for-update', () => sendUpdate({ event: 'checking' }))
autoUpdater.on('update-available', (i) => sendUpdate({ event: 'available', version: i?.version }))
autoUpdater.on('update-not-available', () => sendUpdate({ event: 'not-available' }))
autoUpdater.on('download-progress', (p) => sendUpdate({ event: 'downloading', percent: Math.round(p?.percent || 0) }))
autoUpdater.on('update-downloaded', (i) => sendUpdate({ event: 'downloaded', version: i?.version }))
autoUpdater.on('error', (e) => sendUpdate({ event: 'error', message: String(e?.message || e) }))

// ── Media (camera/mic) permissions ───────────────────────────────────────────
// The renderer (loaded from localhost = secure context) can call getUserMedia,
// but Electron still routes the permission request through these handlers. Grant
// a small allowlist so webcam/mic features in the train pages work out of the box.
// Note: on Windows the OS camera privacy toggle ("Let desktop apps access your
// camera") must also be enabled — that's a system setting, not controllable here.
const ALLOWED_PERMISSIONS = new Set([
  'media', // camera + microphone (getUserMedia)
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
])

function setupPermissions() {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
  // Auto-pick the first device when the renderer enumerates media (Electron 33+).
  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler(() => true)
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
async function bootBundledServices() {
  // Packaged builds spawn the bundled backend + frontend themselves. In dev
  // (npm/pnpm start) we rely on start.bat and APP_URL/AUTH_URL defaults.
  if (!app.isPackaged) return
  try {
    const [api, web] = await Promise.all([
      services.startBackend(),
      services.startFrontend(),
    ])
    AUTH_URL = api
    APP_URL = web
  } catch (e) {
    console.error('[phoenix] failed to start bundled services:', e)
  }
}

// Runtime URLs exposed to the renderer via the preload script. These override
// the hard-coded NEXT_PUBLIC_API_URL baked in at build time so the frontend
// reaches the bundled backend on its actual (random) port.
ipcMain.on('phoenix:runtime-config-sync', (e) => {
  e.returnValue = {
    apiUrl: AUTH_URL,
    wsUrl: AUTH_URL.replace(/^http/, 'ws'),
    edition: EDITION,
  }
})

app.whenReady().then(async () => {
  // Handle a cold-start deep link passed in argv (Windows).
  const argvLink = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`))
  if (argvLink) pendingDeepLink = argvLink

  setupPermissions()
  startLoopbackServer()

  await bootBundledServices()
  createWindow()

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  services.stopAll()
})
