'use strict'

// Preload for an embedded module (Flow). Two jobs:
//  1. Seed the hub's Supabase session into this view's localStorage at
//     document-start so the module starts already signed-in (no duplicate login).
//  2. Tell the module it is embedded in PhoenixNest, so it hides its own
//     account / user-management / logout UI (the hub owns those).
// Sandbox-safe: uses only ipcRenderer + contextBridge + web APIs.

const { ipcRenderer, contextBridge } = require('electron')

try {
  const entries = ipcRenderer.sendSync('module:get-session') || []
  for (const entry of entries) {
    if (entry && entry.key && entry.value != null) {
      window.localStorage.setItem(entry.key, entry.value)
    }
  }
} catch (err) {
  console.error('[flow-preload] session seed failed:', err)
}

try {
  contextBridge.exposeInMainWorld('phoenixNest', { embedded: true })
} catch (err) {
  console.error('[flow-preload] bridge expose failed:', err)
}
