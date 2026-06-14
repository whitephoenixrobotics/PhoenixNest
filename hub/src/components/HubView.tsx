'use client'

import { useEffect, useState } from 'react'
import { Plus, LogOut, X, Loader2, ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { signOut, type AuthUser } from '@/lib/auth'
import { CATALOG, type ModuleDef } from '@/lib/modules'
import { isDesktop, openModule, closeModule } from '@/lib/desktop'

const STORE_KEY = 'phoenixnest.installed'

export function HubView({ user }: { user: AuthUser | null }) {
  const [installed, setInstalled] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [opening, setOpening] = useState<ModuleDef | null>(null)
  const [active, setActive] = useState<ModuleDef | null>(null) // embedded module
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) setInstalled(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [])

  function persist(ids: string[]) {
    setInstalled(ids)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }

  async function handleOpen(m: ModuleDef) {
    setError(null)
    if (!isDesktop()) {
      setError('เปิดโมดูลได้เฉพาะในแอป PhoenixNest (desktop)')
      return
    }
    setOpening(m)
    const res = await openModule(m.id)
    setOpening(null)
    if (res.ok) setActive(m)
    else setError(res.error || 'เปิดโมดูลไม่สำเร็จ')
  }

  async function handleBack() {
    await closeModule()
    setActive(null)
  }

  // When a module is embedded, the native view covers everything below the
  // 44px bar — render just the back bar (must match MODULE_TOPBAR in main.js).
  if (active) {
    return (
      <div style={{ height: 44 }} className="flex items-center gap-3 px-4 border-b border-zinc-800 bg-zinc-950">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white cursor-pointer"
        >
          <ArrowLeft size={16} /> กลับ Hub
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <span className="text-lg">{active.icon}</span>
        <span className="text-sm font-medium text-white">{active.name}</span>
      </div>
    )
  }

  const installedModules = CATALOG.filter((m) => installed.includes(m.id))

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">PhoenixNest</h1>
            <p className="text-xs text-zinc-500">AI Ecosystem Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="text-right">
              <p className="text-sm text-zinc-200 leading-tight">{user.name}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
          )}
          <button
            onClick={() => signOut().then(() => location.replace('/login'))}
            title="ออกจากระบบ"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">โมดูลของฉัน</h2>
          <span className="text-xs text-zinc-500">{installedModules.length} ติดตั้งแล้ว</span>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {installedModules.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {installedModules.map((m) => (
              <button
                key={m.id}
                onClick={() => handleOpen(m)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-600/60 hover:bg-zinc-900/60 transition-colors cursor-pointer"
              >
                <div className="text-3xl mb-3">{m.icon}</div>
                <div className="font-semibold text-white">{m.name}</div>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{m.description}</p>
              </button>
            ))}
            <button
              onClick={() => setAdding(true)}
              className="flex flex-col items-center justify-center gap-2 min-h-[140px] rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-violet-600 hover:text-violet-400 transition-colors cursor-pointer"
            >
              <Plus size={28} />
              <span className="text-sm">เพิ่มโมดูล</span>
            </button>
          </div>
        )}
      </main>

      {adding && (
        <AddModuleDialog
          installed={installed}
          onClose={() => setAdding(false)}
          onInstalled={(id) => persist([...installed, id])}
        />
      )}
      {opening && <OpeningOverlay module={opening} />}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 gap-4">
      <div className="text-5xl">📦</div>
      <div>
        <p className="text-zinc-300 font-medium">ยังไม่มีโมดูล</p>
        <p className="text-sm text-zinc-500 mt-1">กดปุ่มด้านล่างเพื่อเลือกติดตั้งโมดูลแรกของคุณ</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
      >
        <Plus size={18} /> เพิ่มโมดูล
      </button>
    </div>
  )
}

function OpeningOverlay({ module }: { module: ModuleDef }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950/90 backdrop-blur-sm">
      <div className="text-5xl">{module.icon}</div>
      <p className="flex items-center gap-2 text-zinc-300">
        <Loader2 className="animate-spin" size={18} /> กำลังเปิด {module.name}…
      </p>
      <p className="text-xs text-zinc-600">เริ่มเซิร์ฟเวอร์ครั้งแรกอาจใช้เวลาสักครู่</p>
    </div>
  )
}

function AddModuleDialog({
  installed,
  onClose,
  onInstalled,
}: {
  installed: string[]
  onClose: () => void
  onInstalled: (id: string) => void
}) {
  const [installing, setInstalling] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const choices = CATALOG.filter((m) => !installed.includes(m.id))

  function install(m: ModuleDef) {
    if (!m.available || installing) return
    setInstalling(m.id)
    setProgress(0)
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer)
          onInstalled(m.id)
          setInstalling(null)
          return 100
        }
        return p + 10
      })
    }, 120)
  }

  return (
    <Overlay onClose={installing ? undefined : onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white">เพิ่มโมดูล</h3>
          {!installing && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {choices.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">ติดตั้งครบทุกโมดูลแล้ว 🎉</p>
          )}
          {choices.map((m) => {
            const isInstalling = installing === m.id
            return (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="text-2xl">{m.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{m.name}</span>
                    <span className="text-[10px] text-zinc-500">{m.size}</span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{m.description}</p>
                  {isInstalling && (
                    <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
                <button
                  disabled={!m.available || !!installing}
                  onClick={() => install(m)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer enabled:bg-violet-600 enabled:hover:bg-violet-500 enabled:text-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
                >
                  {isInstalling ? (
                    <span className="flex items-center gap-1">
                      <Loader2 size={14} className="animate-spin" /> {progress}%
                    </span>
                  ) : m.available ? (
                    'ติดตั้ง'
                  ) : (
                    'เร็ว ๆ นี้'
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}
