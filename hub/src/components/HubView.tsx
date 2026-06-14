'use client'

import { useEffect, useState } from 'react'
import { Plus, LogOut, X, Loader2, Check } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { signOut, type AuthUser } from '@/lib/auth'
import { CATALOG, type ModuleDef } from '@/lib/modules'

const STORE_KEY = 'phoenixnest.installed'

export function HubView({ user }: { user: AuthUser | null }) {
  const [installed, setInstalled] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState<ModuleDef | null>(null)

  // Restore install state (until the Electron-side store lands).
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

  const installedModules = CATALOG.filter((m) => installed.includes(m.id))

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
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

      {/* Module grid */}
      <main className="flex-1 p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">โมดูลของฉัน</h2>
          <span className="text-xs text-zinc-500">{installedModules.length} ติดตั้งแล้ว</span>
        </div>

        {installedModules.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {installedModules.map((m) => (
              <button
                key={m.id}
                onClick={() => setOpened(m)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-600/60 hover:bg-zinc-900/60 transition-colors cursor-pointer"
              >
                <div className="text-3xl mb-3">{m.icon}</div>
                <div className="font-semibold text-white">{m.name}</div>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{m.description}</p>
              </button>
            ))}

            {/* Add card */}
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
      {opened && <OpenModuleDialog module={opened} onClose={() => setOpened(null)} />}
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
    // Simulated download/install — replaced by a real bundle downloader later.
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

function OpenModuleDialog({ module, onClose }: { module: ModuleDef; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <div className="text-5xl mb-3">{module.icon}</div>
        <h3 className="text-lg font-semibold text-white">{module.name}</h3>
        <p className="text-sm text-zinc-500 mt-2">
          กำลังจะเปิด {module.name} ในหน้าต่าง PhoenixNest นี้
          <br />
          <span className="text-zinc-600 text-xs">(การฝังหน้าต่างโมดูลจริงอยู่ใน phase ถัดไป)</span>
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
          <Check size={14} /> ติดตั้งแล้ว
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
        >
          เข้าใจแล้ว
        </button>
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
