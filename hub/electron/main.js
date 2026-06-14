'use strict'

const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const http = require('http')

// In dev the Next dev server serves the shell. Packaging (static export) is a
// later phase.
const APP_URL = process.env.PHOENIXNEST_APP_URL || 'http://localhost:3000'

// Loopback port the system browser is redirected to after Google OAuth. Same
// port as Flow so it's already allow-listed in the shared Supabase project.
const LOOPBACK_PORT = 53682

let mainWindow = null
let loopbackServer = null

// Single-instance lock — required so the OAuth redirect (2nd launch on
// Windows) reaches the running app instead of spawning a new one.
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
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
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

  // External links open in the system browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(APP_URL)
}

// Receives the Supabase OAuth redirect (?code=...) and forwards it into the app
// window's /auth/callback route, where supabase-js finishes the PKCE exchange
// using the verifier it stored in this same renderer.
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

// ── IPC ──
ipcMain.handle('phoenixnest:get-version', () => app.getVersion())
ipcMain.on('phoenixnest:get-version-sync', (e) => {
  e.returnValue = app.getVersion()
})
ipcMain.on('phoenixnest:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})

app.whenReady().then(() => {
  startLoopbackServer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
