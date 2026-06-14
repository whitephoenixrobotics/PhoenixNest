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
  version,
  openExternal: (url) => ipcRenderer.send('phoenixnest:open-external', url),
})
