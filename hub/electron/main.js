'use strict'

const { app, BrowserWindow, WebContentsView, shell, ipcMain } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { spawn, execSync } = require('child_process')
const installer = require('./installer')

// Free a TCP port by killing whatever is listening on it (Windows).
function killPort(port) {
  try {
    execSync(
      `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`,
      { shell: 'cmd.exe', stdio: 'ignore' },
    )
  } catch {
    /* nothing listening — fine */
  }
}

// Module process logs (gitignored) — for diagnosing embedded modules.
const LOG_DIR = path.join(__dirname, '..', '.module-logs')
try {
  fs.mkdirSync(LOG_DIR, { recursive: true })
} catch {
  /* ignore */
}
function logFd(name) {
  try {
    return fs.openSync(path.join(LOG_DIR, name), 'w')
  } catch {
    return 'ignore'
  }
}

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
      // Use localhost (matches how `next dev` binds) so the dev HMR websocket
      // connects — loading via 127.0.0.1 made HMR reject + full-reload in a loop.
      ready: 'http://localhost:3100',
      url: 'http://localhost:3100',
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

// Is an NVIDIA GPU present? (decides cpu vs gpu module edition)
function hasNvidiaGpu() {
  try {
    execSync('nvidia-smi -L', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Resolve a registry module entry into a concrete download spec, picking the
// right edition (gpu/cpu) when the entry has `editions`.
function resolveSpec(mod, forceEdition) {
  const base = { id: mod.id, name: mod.name, type: mod.type, runtimeEnv: mod.runtimeEnv || null }
  if (mod.editions) {
    const want =
      forceEdition && mod.editions[forceEdition]
        ? forceEdition
        : hasNvidiaGpu() && mod.editions.gpu
          ? 'gpu'
          : mod.editions.cpu
            ? 'cpu'
            : Object.keys(mod.editions)[0]
    const ed = mod.editions[want]
    if (!ed) return null
    return { ...base, edition: want, version: ed.latest, url: ed.url, parts: ed.parts, sha256: ed.sha256 }
  }
  return { ...base, version: mod.latest, url: mod.url, parts: mod.parts, sha256: mod.sha256 }
}

// True when ai-flow can run from the monorepo source (dev checkout).
function aiFlowDevAvailable() {
  return (
    fs.existsSync(path.join(API_DIR, 'venv', 'Scripts', 'python.exe')) &&
    fs.existsSync(path.join(WEB_DIR, 'node_modules'))
  )
}

// Create + embed the WebContentsView. `preload` optional (used by service modules
// to seed the Supabase session).
function createModuleView(usePreload) {
  moduleView = new WebContentsView({
    webPreferences: {
      ...(usePreload ? { preload: path.join(__dirname, 'flow-preload.js') } : {}),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.contentView.addChildView(moduleView)
  layoutModuleView()
}

// ── Open dispatcher: installed bundle (static/service) or dev fallback ──
async function openModule(id) {
  if (moduleView) return { ok: true } // already open

  const installed = installer.readInstalled()[id]
  if (installed && installed.type === 'static') return openStatic(installed)
  if (installed && installed.type === 'service') return openServiceBundle(installed)

  // Dev fallback: run ai-flow from the monorepo source.
  if (id === 'ai-flow' && MODULES[id]) return openServiceDev(MODULES[id])

  return { ok: false, error: `module not installed: ${id}` }
}

// Static module: load its entry file directly into the embedded view.
async function openStatic(installed) {
  const entry = path.join(installed.path, installed.manifest?.entry || 'index.html')
  if (!fs.existsSync(entry)) return { ok: false, error: `entry not found: ${entry}` }
  createModuleView(false)
  await moduleView.webContents.loadFile(entry)
  if (process.env.PHOENIXNEST_DEBUG) moduleView.webContents.openDevTools({ mode: 'detach' })
  return { ok: true }
}

// Service module from an installed bundle: spawn the PyInstaller backend exe +
// the Next standalone frontend (via Electron's bundled node), then embed.
async function openServiceBundle(installed) {
  const m = installed.manifest || {}
  const be = m.backend || {}
  const fe = m.frontend || {}
  const root = installed.path
  const bePort = be.port || 8000
  const fePort = fe.port || 3100

  killPort(bePort)
  killPort(fePort)

  const logId = m.id || 'module'
  // Backend: either a self-contained exe (Flow's PyInstaller build) OR an
  // interpreter + args (PhoenixPy runs `python -m uvicorn …` because it must
  // execute the user's Python — venvs/kernels — which a frozen exe can't).
  const beCmd = be.cmd
    ? path.join(root, be.cmd)
    : path.join(root, be.exe || 'backend/phoenix-api.exe')
  if (!fs.existsSync(beCmd)) return { ok: false, error: `backend not found: ${beCmd}` }
  const beArgs = (be.args || []).map((a) => String(a).replace('{PORT}', String(bePort)))
  const beCwd = be.cwd ? path.join(root, be.cwd) : path.dirname(beCmd)
  const beProc = spawn(beCmd, beArgs, {
    cwd: beCwd,
    // Runtime config for the backend (e.g. SUPABASE_URL). Comes from the bundle's
    // module.json (be.env) and/or the registry (installed.runtimeEnv) — the
    // latter lets us fix config without rebuilding/re-uploading the bundle.
    env: {
      ...process.env,
      // `python -m uvicorn app.main:app` resolves app/ from cwd; set PYTHONPATH
      // too so it works regardless of how the interpreter was invoked.
      ...(be.cmd ? { PYTHONPATH: beCwd } : {}),
      ...(be.env || {}),
      ...(installed.runtimeEnv || {}),
      [be.portEnv || 'PHOENIX_API_PORT']: String(bePort),
    },
    windowsHide: true,
    stdio: ['ignore', logFd(`${logId}-backend.log`), logFd(`${logId}-backend.log`)],
  })
  beProc.on('error', (e) => console.error('[module] bundle backend error:', e.message))
  procs.push(beProc)

  // Frontend: Next standalone server, run with Electron's node (ELECTRON_RUN_AS_NODE).
  const feEntry = path.join(root, fe.entry || 'web/apps/web/server.js')
  if (!fs.existsSync(feEntry)) return { ok: false, error: `frontend not found: ${feEntry}` }
  const feProc = spawn(process.execPath, [feEntry], {
    cwd: path.dirname(feEntry),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(fePort), HOSTNAME: '127.0.0.1' },
    windowsHide: true,
    stdio: ['ignore', logFd(`${logId}-frontend.log`), logFd(`${logId}-frontend.log`)],
  })
  feProc.on('error', (e) => console.error('[module] bundle frontend error:', e.message))
  procs.push(feProc)

  try {
    await waitForHttp(be.health || `http://127.0.0.1:${bePort}/health`, 60000)
    await waitForHttp(fe.ready || `http://127.0.0.1:${fePort}/`, 60000)
  } catch (e) {
    stopModule()
    return { ok: false, error: String(e.message || e) }
  }

  createModuleView(true)
  await moduleView.webContents.loadURL(m.url || `http://127.0.0.1:${fePort}`)
  if (process.env.PHOENIXNEST_DEBUG) moduleView.webContents.openDevTools({ mode: 'detach' })
  return { ok: true }
}

// Service module (ai-flow) from the monorepo source — the Phase 1 dev path.
async function openServiceDev(cfg) {
  killPort(8000)
  killPort(3100)

  const beOut = logFd('ai-flow-backend.log')
  const be = spawn(cfg.backend.cmd, cfg.backend.args, {
    cwd: cfg.backend.cwd,
    env: { ...process.env, ...cfg.backend.env },
    windowsHide: true,
    stdio: ['ignore', beOut, beOut],
  })
  be.on('error', (e) => console.error('[module] backend spawn error:', e.message))
  procs.push(be)

  const feOut = logFd('ai-flow-frontend.log')
  const fe = spawn(cfg.frontend.cmd, cfg.frontend.args, {
    cwd: cfg.frontend.cwd,
    env: { ...process.env, ...cfg.frontend.env },
    windowsHide: true,
    shell: true,
    stdio: ['ignore', feOut, feOut],
  })
  fe.on('error', (e) => console.error('[module] frontend spawn error:', e.message))
  procs.push(fe)

  try {
    await waitForHttp(cfg.backend.health, 40000)
    await waitForHttp(cfg.frontend.ready, 90000)
  } catch (e) {
    stopModule()
    return { ok: false, error: String(e.message || e) }
  }

  createModuleView(true)
  await moduleView.webContents.loadURL(cfg.frontend.url)
  if (process.env.PHOENIXNEST_DEBUG) moduleView.webContents.openDevTools({ mode: 'detach' })
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

// ── Module registry + install ──
ipcMain.handle('module:registry', async () => {
  try {
    const registry = await installer.fetchRegistry()
    // Enrich each module with the edition that WOULD be installed on this machine,
    // so the renderer can show availability + size without knowing GPU details.
    for (const mod of registry.modules || []) {
      const spec = resolveSpec(mod)
      mod.available = mod.available !== false && !!spec && (!!spec.url || !!spec.parts)
      if (spec?.edition) mod.edition = spec.edition
      if (mod.editions && spec?.edition) mod.size = mod.editions[spec.edition]?.size
    }
    return { ok: true, registry }
  } catch (e) {
    return { ok: false, error: String(e.message || e), registry: { modules: [] } }
  }
})

ipcMain.handle('module:installed', () => {
  const map = installer.readInstalled()
  // In a dev checkout (PHOENIXNEST_DEV=1), surface ai-flow as installed so it
  // runs from the monorepo source. Otherwise it appears in "add module" and is
  // installed as a real downloaded bundle.
  if (process.env.PHOENIXNEST_DEV && !map['ai-flow'] && aiFlowDevAvailable()) {
    map['ai-flow'] = { version: 'dev', type: 'service', dev: true }
  }
  return map
})

ipcMain.handle('module:install', async (e, id, edition) => {
  try {
    const reg = await installer.fetchRegistry()
    const mod = (reg.modules || []).find((m) => m.id === id)
    if (!mod) return { ok: false, error: `module not in registry: ${id}` }
    const spec = resolveSpec(mod, edition)
    if (!spec || (!spec.url && !spec.parts)) return { ok: false, error: `no download for module: ${id}` }
    const info = await installer.installModule(spec, (p) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('module:install-progress', { id, ...p })
      }
    })
    return { ok: true, info }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
})

ipcMain.handle('module:uninstall', (_e, id) => {
  try {
    installer.uninstallModule(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
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
