'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, LogOut, X, Loader2, ArrowLeft, ShieldCheck, Download, Trash2, Cpu, Zap, Check, RefreshCw, Bell, Square,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { signOut, type AuthUser } from '@/lib/auth'
import {
  isDesktop,
  openModule,
  closeModule,
  type RegistryModule,
  type InstalledMap,
  type InstallProgress,
  type UpdateItem,
} from '@/lib/desktop'

// Where to get a new hub build (self-update apply isn't wired yet — the update
// notification opens this page so the user can download the latest installer).
const HUB_RELEASES_URL = 'https://github.com/whitephoenixrobotics/PhoenixNest/releases/latest'

export function HubView({ user }: { user: AuthUser | null }) {
  const router = useRouter()
  const [registry, setRegistry] = useState<RegistryModule[]>([])
  const [installed, setInstalled] = useState<InstalledMap>({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [opening, setOpening] = useState<RegistryModule | null>(null)
  const [active, setActive] = useState<RegistryModule | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [confirmDel, setConfirmDel] = useState<RegistryModule | null>(null)
  const [removing, setRemoving] = useState(false)
  const [chooseEdition, setChooseEdition] = useState<RegistryModule | null>(null)
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [showUpdates, setShowUpdates] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const refreshUpdates = useCallback(async () => {
    if (!window.phoenixNest) return
    const r = await window.phoenixNest.getUpdates()
    if (r.ok) setUpdates(r.updates)
  }, [])

  const refreshInstalled = useCallback(async () => {
    if (!window.phoenixNest) return
    setInstalled(await window.phoenixNest.getInstalled())
    refreshUpdates()
  }, [refreshUpdates])

  useEffect(() => {
    if (!isDesktop() || !window.phoenixNest) {
      setLoading(false)
      setError('เปิดผ่านแอป PhoenixNest เพื่อจัดการโมดูล')
      return
    }
    const unsub = window.phoenixNest.onInstallProgress((p) => setProgress(p))
    Promise.all([window.phoenixNest.getRegistry(), window.phoenixNest.getInstalled()])
      .then(([reg, inst]) => {
        if (reg.ok) setRegistry(reg.registry.modules || [])
        else setError(reg.error || 'โหลด registry ไม่สำเร็จ')
        setInstalled(inst)
      })
      .finally(() => setLoading(false))
    refreshUpdates()
    return unsub
  }, [refreshUpdates])

  async function handleUpdate(u: UpdateItem) {
    if (u.kind !== 'module') return // hub self-update wired in a later step
    setError(null)
    setUpdatingId(u.id)
    setProgress({ id: u.id, phase: 'download', percent: 0 })
    const res = await window.phoenixNest!.installModule(u.id, u.edition || undefined)
    setProgress(null)
    setUpdatingId(null)
    if (res.ok) await refreshInstalled()
    else if (!res.cancelled) setError(res.error || 'อัพเดทไม่สำเร็จ')
  }

  async function handleOpen(m: RegistryModule) {
    setError(null)
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

  async function handleInstall(m: RegistryModule, edition?: string) {
    setError(null)
    setProgress({ id: m.id, phase: 'download', percent: 0 })
    const res = await window.phoenixNest!.installModule(m.id, edition)
    setProgress(null)
    if (res.ok) {
      await refreshInstalled()
      setChooseEdition(null)
      setAdding(false)
    } else if (!res.cancelled) setError(res.error || 'ติดตั้งไม่สำเร็จ')
  }

  function handleCancelInstall() {
    window.phoenixNest?.cancelInstall?.()
  }

  async function doUninstall() {
    if (!confirmDel) return
    setRemoving(true)
    const res = await window.phoenixNest!.uninstallModule(confirmDel.id)
    setRemoving(false)
    setConfirmDel(null)
    if (res.ok) await refreshInstalled()
    else setError(res.error || 'ลบไม่สำเร็จ')
  }

  // Embedded module open → render only the back bar (native view covers the rest).
  if (active) {
    return (
      <div style={{ height: 44 }} className="flex items-center gap-3 px-4 border-b border-zinc-800 bg-zinc-950">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white cursor-pointer">
          <ArrowLeft size={16} /> กลับ Hub
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <span className="text-lg">{active.icon}</span>
        <span className="text-sm font-medium text-white">{active.name}</span>
      </div>
    )
  }

  const installedModules = registry.filter((m) => installed[m.id])

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
          <button
            onClick={() => setShowUpdates(true)}
            title={updates.length ? `มีอัพเดท ${updates.length} รายการ` : 'ตรวจสอบอัพเดท'}
            className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
              updates.length
                ? 'text-amber-300 hover:bg-amber-500/15'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Bell size={18} />
            {updates.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                {updates.length}
              </span>
            )}
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              title="จัดการผู้ใช้"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-violet-300 text-sm transition-colors cursor-pointer"
            >
              <ShieldCheck size={15} /> จัดการผู้ใช้
            </button>
          )}
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

        {loading ? (
          <p className="flex items-center gap-2 text-zinc-400">
            <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
          </p>
        ) : installedModules.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {installedModules.map((m) => (
              <div
                key={m.id}
                className="group relative bg-zinc-900 border border-zinc-800 rounded-xl hover:border-violet-600/60 hover:bg-zinc-900/60 transition-colors"
              >
                <button onClick={() => handleOpen(m)} className="w-full text-left p-5 cursor-pointer">
                  <div className="text-3xl mb-3">{m.icon}</div>
                  <div className="font-semibold text-white">{m.name}</div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{m.description}</p>
                  {installed[m.id]?.dev && <span className="text-[10px] text-amber-400/80">dev</span>}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDel(m)
                  }}
                  title="ลบโมดูล"
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-red-600/15 hover:text-red-400 transition-all cursor-pointer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
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
          registry={registry}
          installed={installed}
          progress={progress}
          onClose={() => setAdding(false)}
          onInstall={(m) => handleInstall(m)}
          onChoose={(m) => setChooseEdition(m)}
          onCancel={handleCancelInstall}
        />
      )}
      {chooseEdition && (
        <EditionChooser
          module={chooseEdition}
          progress={progress}
          onClose={() => setChooseEdition(null)}
          onInstall={(ed) => handleInstall(chooseEdition, ed)}
          onCancel={handleCancelInstall}
        />
      )}
      {opening && <OpeningOverlay module={opening} />}
      {confirmDel && (
        <ConfirmDeleteDialog
          module={confirmDel}
          busy={removing}
          onCancel={() => setConfirmDel(null)}
          onConfirm={doUninstall}
        />
      )}
      {showUpdates && (
        <UpdatesDialog
          updates={updates}
          progress={progress}
          updatingId={updatingId}
          onClose={() => setShowUpdates(false)}
          onUpdate={handleUpdate}
          onCancel={handleCancelInstall}
        />
      )}
    </div>
  )
}

function UpdatesDialog({
  updates,
  progress,
  updatingId,
  onClose,
  onUpdate,
  onCancel,
}: {
  updates: UpdateItem[]
  progress: InstallProgress | null
  updatingId: string | null
  onClose: () => void
  onUpdate: (u: UpdateItem) => void
  onCancel: () => void
}) {
  const busy = !!updatingId
  return (
    <Overlay onClose={busy ? undefined : onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white">อัพเดท</h3>
          {!busy && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {updates.length === 0 && (
            <div className="text-center py-8 text-zinc-400">
              <Check className="mx-auto mb-2 text-emerald-400" size={28} />
              <p className="text-sm">ทุกอย่างเป็นเวอร์ชันล่าสุดแล้ว</p>
            </div>
          )}
          {updates.map((u) => {
            const isUpdating = updatingId === u.id
            const isHub = u.kind === 'hub'
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="text-2xl">{u.icon || '📦'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{u.name}</span>
                    {isHub && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">แอปหลัก</span>}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {u.installed} <span className="text-zinc-600">→</span>{' '}
                    <span className="text-amber-300">{u.latest}</span>
                  </p>
                  {isUpdating && progress && (
                    <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress.percent}%` }} />
                    </div>
                  )}
                </div>
                {isHub ? (
                  <button
                    onClick={() => window.phoenixNest?.openExternal?.(HUB_RELEASES_URL)}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer bg-amber-500 hover:bg-amber-400 text-zinc-950"
                  >
                    <Download size={14} /> ดาวน์โหลด
                  </button>
                ) : isUpdating ? (
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-sm text-amber-300">
                      <Loader2 size={14} className="animate-spin" /> {progress?.percent ?? 0}%
                    </span>
                    <button
                      onClick={onCancel}
                      title="หยุด"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium cursor-pointer bg-red-600/90 hover:bg-red-500 text-white"
                    >
                      <Square size={13} className="fill-current" /> หยุด
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => onUpdate(u)}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer disabled:cursor-not-allowed enabled:bg-amber-500 enabled:hover:bg-amber-400 enabled:text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    <RefreshCw size={14} /> อัพเดท
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Overlay>
  )
}

function ConfirmDeleteDialog({
  module,
  busy,
  onCancel,
  onConfirm,
}: {
  module: RegistryModule
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay onClose={busy ? undefined : onCancel}>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <Trash2 className="text-red-400" size={22} />
        </div>
        <h3 className="text-base font-semibold text-white">ลบ {module.name}?</h3>
        <p className="text-sm text-zinc-500 mt-2">
          จะลบไฟล์โมดูลออกจากเครื่อง ติดตั้งใหม่ได้ภายหลังจากหน้า “เพิ่มโมดูล”
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} ลบ
          </button>
        </div>
      </div>
    </Overlay>
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

function OpeningOverlay({ module }: { module: RegistryModule }) {
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

const PHASE_LABEL: Record<InstallProgress['phase'], string> = {
  download: 'กำลังดาวน์โหลด',
  verify: 'กำลังตรวจสอบไฟล์',
  extract: 'กำลังแตกไฟล์',
  done: 'เสร็จสิ้น',
}

function fmtMB(b?: number) {
  return b ? `${(b / 1024 / 1024).toFixed(1)}MB` : ''
}

function fmtSize(b?: number) {
  if (!b) return ''
  const gb = b / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(b / 1024 / 1024)} MB`
}

const EDITION_DEFS = [
  {
    key: 'cpu',
    label: 'CPU only',
    Icon: Cpu,
    tagline: 'เหมาะกับโน้ตบุ๊ก/พีซีทั่วไปที่ไม่มีการ์ดจอ NVIDIA',
    bullets: ['ใช้ได้กับทุกเครื่อง Windows 10/11', 'ไฟล์ติดตั้งเล็กกว่า', 'ฟีเจอร์ AI ครบทุกบล็อก', 'ความเร็วระดับมาตรฐาน'],
    btn: 'ดาวน์โหลด CPU',
  },
  {
    key: 'gpu',
    label: 'CPU + CUDA',
    Icon: Zap,
    tagline: 'สำหรับเครื่องที่มีการ์ดจอ NVIDIA (รองรับ CUDA)',
    bullets: ['เร่งด้วย GPU เร็วขึ้นหลายเท่า', 'เหมาะกับงานวิดีโอ/เรียลไทม์', 'ฟีเจอร์ AI ครบทุกบล็อก', 'มี CUDA runtime ในตัว ไม่ต้องลงเพิ่ม'],
    btn: 'ดาวน์โหลด CPU + CUDA',
  },
] as const

function EditionChooser({
  module,
  progress,
  onClose,
  onInstall,
  onCancel,
}: {
  module: RegistryModule
  progress: InstallProgress | null
  onClose: () => void
  onInstall: (edition: string) => void
  onCancel: () => void
}) {
  const [installingEd, setInstallingEd] = useState<string | null>(null)
  const busy = !!installingEd
  // Install finished (done or cancelled) → progress cleared → revert the button.
  useEffect(() => {
    if (!progress) setInstallingEd(null)
  }, [progress])

  return (
    <Overlay onClose={busy ? undefined : onClose}>
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h3 className="font-semibold text-white">ติดตั้ง {module.name}</h3>
            <p className="text-xs text-zinc-500">เลือกเวอร์ชันให้เหมาะกับเครื่องของคุณ</p>
          </div>
          {!busy && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EDITION_DEFS.map((def) => {
            const ed = module.editions?.[def.key]
            const available = !!ed
            const recommended = module.edition === def.key
            const isInstalling = installingEd === def.key
            const highlight = recommended
            return (
              <div
                key={def.key}
                className={`relative rounded-2xl p-5 border flex flex-col ${
                  highlight ? 'bg-violet-600/15 border-violet-500/50' : 'bg-zinc-950/50 border-zinc-800'
                }`}
              >
                {recommended && (
                  <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/25 text-violet-200 border border-violet-400/30">
                    แนะนำสำหรับเครื่องนี้
                  </span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <def.Icon size={22} className={highlight ? 'text-violet-300' : 'text-zinc-300'} />
                  <span className="text-lg font-bold text-white">{def.label}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 min-h-[32px]">{def.tagline}</p>
                <ul className="flex flex-col gap-2 mb-5 flex-1">
                  {def.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check size={15} className={`mt-0.5 shrink-0 ${highlight ? 'text-violet-300' : 'text-emerald-400'}`} />
                      {b}
                    </li>
                  ))}
                </ul>
                {isInstalling ? (
                  <button
                    onClick={onCancel}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 bg-red-600/90 hover:bg-red-500 text-white"
                  >
                    <Square size={14} className="fill-current" /> หยุด ({progress?.percent ?? 0}%)
                  </button>
                ) : (
                  <button
                    disabled={!available || busy}
                    onClick={() => {
                      setInstallingEd(def.key)
                      onInstall(def.key)
                    }}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      highlight
                        ? 'bg-white text-zinc-900 enabled:hover:bg-zinc-100 disabled:bg-white/40'
                        : 'bg-zinc-800 text-white enabled:hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-500'
                    }`}
                  >
                    {available ? (
                      <>
                        <Download size={15} /> {def.btn}
                      </>
                    ) : (
                      'ยังไม่พร้อม'
                    )}
                  </button>
                )}
                <p className="text-center text-[11px] text-zinc-500 mt-2">
                  {isInstalling && progress
                    ? `${PHASE_LABEL[progress.phase]} ${progress.percent}%${progress.parts && progress.parts > 1 ? ` · พาร์ท ${progress.part}/${progress.parts}` : ''}`
                    : available
                      ? `ดาวน์โหลดตอนติดตั้ง ~${fmtSize(ed?.size)}`
                      : 'เร็ว ๆ นี้'}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </Overlay>
  )
}

function AddModuleDialog({
  registry,
  installed,
  progress,
  onClose,
  onInstall,
  onChoose,
  onCancel,
}: {
  registry: RegistryModule[]
  installed: InstalledMap
  progress: InstallProgress | null
  onClose: () => void
  onInstall: (m: RegistryModule) => void
  onChoose: (m: RegistryModule) => void
  onCancel: () => void
}) {
  const choices = registry.filter((m) => !installed[m.id])
  const busy = !!progress

  return (
    <Overlay onClose={busy ? undefined : onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white">เพิ่มโมดูล</h3>
          {!busy && (
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
            const isInstalling = progress?.id === m.id
            return (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="text-2xl">{m.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{m.name}</span>
                    {m.size ? <span className="text-[10px] text-zinc-500">{fmtMB(m.size)}</span> : null}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{m.description}</p>
                  {isInstalling && progress && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {PHASE_LABEL[progress.phase]}{' '}
                        {progress.phase === 'download' || progress.phase === 'extract' ? `${progress.percent}%` : ''}
                        {progress.parts && progress.parts > 1 ? ` · พาร์ท ${progress.part}/${progress.parts}` : ''}
                        {progress.total ? ` · ${fmtMB(progress.got)}/${fmtMB(progress.total)}` : ''}
                      </div>
                    </div>
                  )}
                </div>
                {isInstalling ? (
                  <button
                    onClick={onCancel}
                    title="หยุด"
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer bg-red-600/90 hover:bg-red-500 text-white"
                  >
                    <Square size={13} className="fill-current" /> หยุด
                  </button>
                ) : (
                  <button
                    disabled={!m.available || busy}
                    onClick={() => (m.editions ? onChoose(m) : onInstall(m))}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed enabled:bg-violet-600 enabled:hover:bg-violet-500 enabled:text-white disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {m.available ? (
                      <>
                        <Download size={14} /> ติดตั้ง
                      </>
                    ) : (
                      'เร็ว ๆ นี้'
                    )}
                  </button>
                )}
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
