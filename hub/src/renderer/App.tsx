import React from 'react'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🦅</span>
          <span className="logo-text">Phoenix Nest</span>
        </div>
        <nav className="sidebar-nav">
          <a className="nav-item active" href="#">Dashboard</a>
          <a className="nav-item" href="#">Flow</a>
          <a className="nav-item" href="#">Python</a>
          <a className="nav-item" href="#">Circuit</a>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1 className="page-title">Dashboard</h1>
        </header>
        <section className="content">
          <div className="module-grid">
            <ModuleCard name="Flow" description="AI task automation" status="offline" />
            <ModuleCard name="Python" description="Shared Python utilities" status="idle" />
            <ModuleCard name="Circuit" description="IoT integration" status="idle" />
          </div>
        </section>
      </main>
    </div>
  )
}

function ModuleCard({ name, description, status }: { name: string; description: string; status: 'online' | 'offline' | 'idle' }) {
  return (
    <div className={`module-card module-card--${status}`}>
      <div className="module-card-header">
        <span className="module-name">{name}</span>
        <span className={`status-dot status-dot--${status}`} />
      </div>
      <p className="module-desc">{description}</p>
      <span className="module-status">{status}</span>
    </div>
  )
}
