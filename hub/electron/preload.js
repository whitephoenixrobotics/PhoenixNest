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
})
