'use strict'

const { contextBridge, ipcRenderer } = require('electron')

let version = '0.0.0'
try {
  version = ipcRenderer.sendSync('phoenixnest:get-version-sync')
} catch {
  /* keep fallback */
}

contextBridge.exposeInMainWorld('phoenixNest', {
  isDesktop: true,
  embedded: false, // this process is the hub shell itself, not an embedded module
  version,
  openExternal: (url) => ipcRenderer.send('phoenixnest:open-external', url),

  // Module hosting: open spawns + embeds the module (handing over the current
  // Supabase storage so it starts signed-in); close tears it down.
  openModule: (id, storage) => ipcRenderer.invoke('module:open', id, storage),
  closeModule: () => ipcRenderer.invoke('module:close'),

  // Module registry + install (PhoenixNest is the installer — no setup.exe).
  getRegistry: () => ipcRenderer.invoke('module:registry'),
  getInstalled: () => ipcRenderer.invoke('module:installed'),
  installModule: (id, edition) => ipcRenderer.invoke('module:install', id, edition),
  uninstallModule: (id) => ipcRenderer.invoke('module:uninstall', id),
  onInstallProgress: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('module:install-progress', handler)
    return () => ipcRenderer.removeListener('module:install-progress', handler)
  },
})
