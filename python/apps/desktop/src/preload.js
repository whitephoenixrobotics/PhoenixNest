'use strict'

const { contextBridge } = require('electron')

// In packaged mode the main process spawns the bundled backend on a dynamic
// port and passes it down as PHOENIX_API_URL; expose it as the global the
// frontend already reads (api.ts → window.__PHOENIX_API_URL__). In dev this is
// empty, so api.ts falls back to its http://127.0.0.1:8200 default.
const apiUrl = process.env.PHOENIX_API_URL || ''
if (apiUrl) {
  contextBridge.exposeInMainWorld('__PHOENIX_API_URL__', apiUrl)
}

contextBridge.exposeInMainWorld('phoenix', { isDesktop: true })
