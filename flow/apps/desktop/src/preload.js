'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Resolve the app version synchronously so the renderer can read it at startup.
let version = '0.0.0'
try {
  version = ipcRenderer.sendSync('phoenix:get-version-sync')
} catch {
  /* keep fallback */
}

// Runtime API/WS URLs are resolved synchronously below so the renderer's first
// axios call has them. In packaged builds these point at the bundled backend's
// dynamic port; in dev they fall through to NEXT_PUBLIC_API_URL defaults.
let apiUrl = ''
let wsUrl = ''
let edition = ''
try {
  const cfg = ipcRenderer.sendSync('phoenix:runtime-config-sync')
  if (cfg) {
    apiUrl = cfg.apiUrl || ''
    wsUrl = cfg.wsUrl || ''
    edition = cfg.edition || ''
  }
} catch {
  /* dev fallback — use envs */
}

contextBridge.exposeInMainWorld('phoenix', {
  isDesktop: true,
  version,
  edition,
  apiUrl,
  wsUrl,

  openExternal: (url) => ipcRenderer.send('phoenix:open-external', url),

  // OAuth deep link → { token, status }
  onAuthToken: (cb) =>
    ipcRenderer.on('phoenix:auth-token', (_e, data) => cb(data)),

  // Auto-update events → { event, version?, percent?, message? }
  onUpdate: (cb) => ipcRenderer.on('phoenix:update', (_e, info) => cb(info)),
  checkForUpdates: () => ipcRenderer.send('phoenix:check-updates'),
  quitAndInstall: () => ipcRenderer.send('phoenix:quit-and-install'),

  // Connectivity
  checkOnline: () => ipcRenderer.invoke('phoenix:check-online'),
  reloadApp: () => ipcRenderer.invoke('phoenix:reload-app'),
})
