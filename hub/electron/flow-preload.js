'use strict'

// Preload for an embedded module (Flow). Runs at document-start, before the
// module's own scripts. It seeds the Supabase session that the hub user already
// has into this view's localStorage, so the module's supabase client
// (persistSession) starts already signed-in — no duplicate login screen.
//
// We deliberately expose nothing else: the module sees a plain web environment
// (window.phoenix absent), so it uses its normal web API/WS URLs.

const { ipcRenderer } = require('electron')

try {
  const entries = ipcRenderer.sendSync('module:get-session') || []
  for (const entry of entries) {
    if (entry && entry.key && entry.value != null) {
      window.localStorage.setItem(entry.key, entry.value)
    }
  }
} catch (e) {
  console.error('[flow-preload] session seed failed:', e)
}
