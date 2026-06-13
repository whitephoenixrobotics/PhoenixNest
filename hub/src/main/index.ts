import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'

// Repo root = two levels up from hub/ (dist/main → hub → PhoenixNest)
const REPO_ROOT = path.resolve(__dirname, '../../..')
const MODULES_FILE = path.join(REPO_ROOT, 'modules.json')

interface ModuleLaunch {
  command: string
  cwd: string
  shell?: boolean
}

interface ModuleEntry {
  id: string
  name: string
  path: string
  icon?: string
  description?: string
  stack?: string[]
  status: string
  launch?: ModuleLaunch | null
  url?: string | null
  dependsOn?: string[]
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── IPC ───
ipcMain.handle('get-version', () => app.getVersion())

ipcMain.handle('get-modules', () => {
  try {
    const raw = fs.readFileSync(MODULES_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return { ok: true, modules: data.modules as ModuleEntry[], ecosystem: data.ecosystem }
  } catch (err) {
    return { ok: false, error: (err as Error).message, modules: [] as ModuleEntry[] }
  }
})

ipcMain.handle('open-module', (_event, id: string) => {
  try {
    const data = JSON.parse(fs.readFileSync(MODULES_FILE, 'utf-8'))
    const mod = (data.modules as ModuleEntry[]).find((m) => m.id === id)
    if (!mod) return { ok: false, error: `Module "${id}" not found` }
    if (!mod.launch || !mod.launch.command) {
      return { ok: false, error: `Module "${mod.name}" has no launch command` }
    }

    const cwd = path.resolve(REPO_ROOT, mod.launch.cwd || mod.path)
    if (!fs.existsSync(cwd)) return { ok: false, error: `Path not found: ${cwd}` }

    const child = spawn(mod.launch.command, {
      cwd,
      shell: mod.launch.shell ?? true,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    return { ok: true, pid: child.pid, url: mod.url ?? null }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('open-url', (_event, url: string) => {
  if (url) shell.openExternal(url)
  return { ok: true }
})
