'use strict'

// Preload for an embedded module (Flow). Seeds the hub's Supabase session into
// this view's localStorage at document-start so the module's supabase client
// (persistSession) starts already signed-in — no duplicate login. Sandbox-safe:
// uses only ipcRenderer + web APIs.

const { ipcRenderer } = require('electron')

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
