import React, { useEffect, useState } from 'react'
import './App.css'
import type { ModuleEntry } from './types'

export default function App() {
  const [modules, setModules] = useState<ModuleEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    window.phoenixHub
      .getModules()
      .then((res) => {
        if (res.ok) setModules(res.modules)
        else setError(res.error ?? 'Failed to load modules.json')
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleOpen(mod: ModuleEntry) {
    setToast(`Launching ${mod.name}…`)
    const res = await window.phoenixHub.openModule(mod.id)
    if (res.ok) {
      setToast(`${mod.name} started${res.pid ? ` (pid ${res.pid})` : ''}`)
      if (res.url) {
        // give the module a moment to boot, then open its URL
        setTimeout(() => window.phoenixHub.openUrl(res.url!), 1500)
      }
    } else {
      setToast(`⚠️ ${res.error}`)
    }
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🦅</span>
          <span className="logo-text">Phoenix Nest</span>
        </div>
        <nav className="sidebar-nav">
          <a className="nav-item active" href="#">Modules</a>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1 className="page-title">Modules</h1>
          <span className="topbar-sub">{modules.length} registered</span>
        </header>

        <section className="content">
          {loading && <p className="msg">Loading modules…</p>}
          {error && <p className="msg msg-error">Could not read modules.json: {error}</p>}

          {!loading && !error && (
            <div className="module-grid">
              {modules.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onOpen={() => handleOpen(mod)} />
              ))}
            </div>
          )}
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function ModuleCard({ mod, onOpen }: { mod: ModuleEntry; onOpen: () => void }) {
  const canOpen = mod.status === 'active' && !!mod.launch
  return (
    <div className={`module-card module-card--${mod.status}`}>
      <div className="module-card-header">
        <span className="module-icon">{mod.icon ?? '📦'}</span>
        <span className="module-name">{mod.name}</span>
        <span className={`status-dot status-dot--${mod.status}`} title={mod.status} />
      </div>
      <p className="module-desc">{mod.description}</p>
      {mod.stack && mod.stack.length > 0 && (
        <div className="module-tags">
          {mod.stack.map((s) => (
            <span key={s} className="tag">{s}</span>
          ))}
        </div>
      )}
      <div className="module-footer">
        <span className="module-status">{mod.status}</span>
        <button className="btn-open" onClick={onOpen} disabled={!canOpen}>
          {canOpen ? 'Open' : 'Unavailable'}
        </button>
      </div>
    </div>
  )
}
