'use strict'

const { app, BrowserWindow, WebContentsView, shell, ipcMain } = require('electron')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const APP_URL = process.env.PHOENIXNEST_APP_URL || 'http://localhost:3000'
const LOOPBACK_PORT = 53682
const MODULE_TOPBAR = 44 // px reserved at the top for the hub's back bar

// Repo root: hub/electron → hub → PhoenixNest
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const FLOW = path.join(REPO_ROOT, 'flow')

// ── Module launch config (dev-mode: run Flow from the monorepo source) ──
const API_DIR = path.join(FLOW, 'apps', 'api')
const WEB_DIR = path.join(FLOW, 'apps', 'web')
const MODULES = {
  'ai-flow': {
    backend: {
      cmd: path.join(API_DIR, 'venv', 'Scripts', 'python.exe'),
      args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
      cwd: API_DIR,
      env: { PYTHONPATH: API_DIR, PHOENIX_DEV: '1' },
      health: 'http://127.0.0.1:8000/health',
    },
    frontend: {
      cmd: 'node',
      args: [path.join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3100'],
      cwd: WEB_DIR,
      // Bump the heap — Flow's Turbopack compile OOMs under contention otherwise.
      env: { NODE_OPTIONS: '--max-old-space-size=4096' },
      ready: 'http://127.0.0.1:3100',
      url: 'http://127.0.0.1:3100',
    },
  },
}

let mainWindow = null
let loopbackServer = null
let moduleView = null
const procs = [] // spawned module processes
let injectStorage = [] // supabase storage entries to seed into the embedded module

// ── Single-instance lock (OAuth redirect lands on the running app) ──
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusWindow())
}

function focusWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    title: 'PhoenixNest',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('resize', layoutModuleView)
  mainWindow.loadURL(APP_URL)
}

// ── OAuth loopback (same as before) ──
function startLoopbackServer() {
  if (loopbackServer) return
  loopbackServer = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, `http://127.0.0.1:${LOOPBACK_PORT}`)
      if (u.pathname === '/auth/callback') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(SUCCESS_HTML)
        focusWindow()
        if (mainWindow) mainWindow.loadURL(`${APP_URL}/auth/callback${u.search}`)
        return
      }
      res.writeHead(404)
      res.end()
    } catch {
      res.writeHead(400)
      res.end()
    }
  })
  loopbackServer.on('error', (e) => console.error('[phoenixnest] loopback error:', e.message))
  loopbackServer.listen(LOOPBACK_PORT, '127.0.0.1')
}

const SUCCESS_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>เข้าสู่ระบบสำเร็จ</title><style>
body{background:#09090b;color:#e4e4e7;font-family:system-ui,sans-serif;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.c{max-width:360px}h1{font-size:20px;color:#fff}p{color:#a1a1aa;font-size:14px}
.d{width:56px;height:56px;border-radius:50%;background:rgba(124,58,237,.15);color:#a78bfa;
display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px}
</style></head><body><div class="c"><div class="d">✓</div>
<h1>เข้าสู่ระบบสำเร็จ</h1><p>กลับไปที่แอป PhoenixNest ได้เลย — ปิดแท็บนี้ได้</p>
<script>setTimeout(function(){window.close()},1500)</script></div></body></html>`

// ── Helpers: wait for an HTTP endpoint to respond ──
function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`timeout waiting for ${url}`))
        else setTimeout(tick, 600)
      })
      req.setTimeout(2500, () => req.destroy())
    }
    tick()
  })
}

// ── Spawn + embed a module ──
async function openModule(id) {
  const cfg = MODULES[id]
  if (!cfg) return { ok: false, error: `unknown module: ${id}` }
  if (moduleView) return { ok: true } // already open

  // 1. Backend
  const be = spawn(cfg.backend.cmd, cfg.backend.args, {
    cwd: cfg.backend.cwd,
    env: { ...process.env, ...cfg.backend.env },
    windowsHide: true,
  })
  be.on('error', (e) => console.error('[module] backend spawn error:', e.message))
  procs.push(be)

  // 2. Frontend (Next dev via system node)
  const fe = spawn(cfg.frontend.cmd, cfg.frontend.args, {
    cwd: cfg.frontend.cwd,
    env: { ...process.env, ...cfg.frontend.env },
    windowsHide: true,
    shell: true,
  })
  fe.on('error', (e) => console.error('[module] frontend spawn error:', e.message))
  procs.push(fe)

  // 3. Wait until both are reachable
  try {
    await waitForHttp(cfg.backend.health, 40000)
    await waitForHttp(cfg.frontend.ready, 90000)
  } catch (e) {
    stopModule()
    return { ok: false, error: String(e.message || e) }
  }

  // 4. Embed the frontend in a WebContentsView, seeding the session first
  moduleView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'flow-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.contentView.addChildView(moduleView)
  layoutModuleView()
  await moduleView.webContents.loadURL(cfg.frontend.url)
  return { ok: true }
}

function layoutModuleView() {
  if (!moduleView || !mainWindow) return
  const { width, height } = mainWindow.getContentBounds()
  moduleView.setBounds({ x: 0, y: MODULE_TOPBAR, width, height: height - MODULE_TOPBAR })
}

function closeModuleView() {
  if (moduleView && mainWindow) {
    mainWindow.contentView.removeChildView(moduleView)
    moduleView.webContents.close?.()
    moduleView = null
  }
  stopModule()
}

function stopModule() {
  while (procs.length) {
    const p = procs.pop()
    try {
      if (process.platform === 'win32' && p.pid) {
        spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'])
      } else {
        p.kill()
      }
    } catch {
      /* ignore */
    }
  }
}

// ── IPC ──
ipcMain.handle('phoenixnest:get-version', () => app.getVersion())
ipcMain.on('phoenixnest:get-version-sync', (e) => {
  e.returnValue = app.getVersion()
})
ipcMain.on('phoenixnest:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})

// Renderer hands over its Supabase storage so the embedded module starts logged in.
ipcMain.handle('module:open', async (_e, id, storage) => {
  injectStorage = Array.isArray(storage) ? storage : []
  return openModule(id)
})
ipcMain.handle('module:close', () => {
  closeModuleView()
  return { ok: true }
})
// The embedded module's preload reads the session synchronously at document-start.
ipcMain.on('module:get-session', (e) => {
  e.returnValue = injectStorage
})

app.whenReady().then(() => {
  startLoopbackServer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopModule()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', stopModule)
