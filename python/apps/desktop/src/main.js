'use strict'

// PhoenixPy desktop shell (Electron).
//
// Step 1 (this file): a desktop window that shows the app. In dev the user runs
// the servers via start.bat (backend :8200 + frontend :3200) and we just point
// the window at the frontend — the frontend's api.ts defaults to 127.0.0.1:8200,
// so no URL injection is needed.
//
// Step 2 (see services.js / README): packaged mode will detect (or download) a
// Python runtime, bootstrap the backend venv, spawn the bundled backend + Next
// standalone server on dynamic ports, and pass the backend URL to the renderer
// via PHOENIX_API_URL (preload exposes it as window.__PHOENIX_API_URL__).

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const APP_URL = process.env.PHOENIX_APP_URL || 'http://localhost:3200'
const TITLE = 'PhoenixPy'

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: TITLE,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Next.js sets <title> on every navigation; keep the app name pinned.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.setTitle(TITLE)

  win.once('ready-to-show', () => win.show())

  // target=_blank / external links open in the system browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(APP_URL)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
