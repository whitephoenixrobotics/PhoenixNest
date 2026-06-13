'use client'
/* eslint-disable @next/next/no-img-element -- remote Google avatar; next/image optimization is unnecessary in the desktop shell */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, FolderOpen, Loader2, LogOut, Trash2, Blocks, Tags, Crosshair, CheckCircle2, Clock, ShieldCheck,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { projectsApi, flowsApi, trainApi, apiErrorMessage } from '@/lib/api-client'
import { getProfile, signOut, type AuthUser } from '@/lib/auth'
import { desktopVersion } from '@/lib/desktop'
import { uiPrompt, uiConfirm, uiAlert } from '@/lib/dialog'
import type { Project } from '@/types'

interface TrainProject {
  id: string
  name: string
  task: string
  status: 'draft' | 'training' | 'done' | 'failed'
  accuracy?: number | null
  classes?: Record<string, number>
}

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [clsProjects, setClsProjects] = useState<TrainProject[]>([])
  const [detProjects, setDetProjects] = useState<TrainProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState<AuthUser | null>(null)
  // Read the desktop version only after mount — reading window.phoenix during
  // render would mismatch SSR (server has no window) and break hydration.
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersion(desktopVersion())
  }, [])

  const reload = () => {
    Promise.all([projectsApi.list(), trainApi.list('classify'), trainApi.list('detect')])
      .then(([p, c, d]) => {
        setProjects(p.data)
        setClsProjects(c.data)
        setDetProjects(d.data)
        setLoading(false)
      })
      .catch(() => {
        // 401/403 are handled centrally by the axios interceptor.
        setLoading(false)
      })
  }

  useEffect(() => {
    // Gate on approval status before loading the dashboard.
    getProfile()
      .then((user) => {
        if (!user) {
          router.replace('/login')
          return
        }
        setMe(user)
        if (user.status !== 'approved') {
          router.replace('/pending')
          return
        }
        reload()
      })
      .catch(() => setLoading(false))
  }, [router])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  // ── บล็อค AI (flow editor) ──
  const createFlow = async () => {
    const name = await uiPrompt('ชื่อโปรเจกต์ (บล็อค AI):')
    if (!name) return
    setBusy(true)
    try {
      const projectRes = await projectsApi.create({ name })
      const flowRes = await flowsApi.create(projectRes.data.id, { name })
      router.push(`/flows/${flowRes.data.id}`)
    } catch (err) {
      await uiAlert(`สร้างโปรเจกต์ไม่สำเร็จ\n${apiErrorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const openFlow = async (projectId: string, projectName: string) => {
    try {
      const res = await flowsApi.list(projectId)
      const flowId = res.data.length > 0
        ? res.data[0].id
        : (await flowsApi.create(projectId, { name: projectName })).data.id
      router.push(`/flows/${flowId}`)
    } catch (err) {
      await uiAlert(`เปิดโปรเจกต์ไม่สำเร็จ\n${apiErrorMessage(err)}`)
    }
  }

  const deleteFlow = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (!(await uiConfirm('ลบโปรเจกต์นี้?'))) return
    try {
      await projectsApi.delete(projectId)
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
    } catch (err) {
      await uiAlert(`ลบโปรเจกต์ไม่สำเร็จ\n${apiErrorMessage(err)}`)
    }
  }

  // ── TrainAI Classification ──
  const createClassify = async () => {
    const name = await uiPrompt('ชื่อโมเดล (TrainAI Classification):')
    if (!name) return
    setBusy(true)
    try {
      const res = await trainApi.create({ name, task: 'classify' })
      router.push(`/train/classify/${res.data.id}`)
    } catch (err) {
      await uiAlert(`สร้างโมเดลไม่สำเร็จ\n${apiErrorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const deleteClassify = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!(await uiConfirm('ลบโมเดลนี้?'))) return
    try {
      await trainApi.delete(id)
      setClsProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      await uiAlert(`ลบโมเดลไม่สำเร็จ\n${apiErrorMessage(err)}`)
    }
  }

  // ── TrainAI Detection ──
  const createDetect = async () => {
    const name = await uiPrompt('ชื่อโมเดล (TrainAI Detection):')
    if (!name) return
    setBusy(true)
    try {
      const res = await trainApi.create({ name, task: 'detect' })
      router.push(`/train/detect/${res.data.id}`)
    } catch (err) {
      await uiAlert(`สร้างโมเดลไม่สำเร็จ\n${apiErrorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const deleteDetect = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!(await uiConfirm('ลบโมเดลนี้?'))) return
    try {
      await trainApi.delete(id)
      setDetProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      await uiAlert(`ลบโมเดลไม่สำเร็จ\n${apiErrorMessage(err)}`)
    }
  }

  const statusBadge = (s: TrainProject['status'], acc?: number | null) => {
    if (s === 'done')
      return <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} /> เสร็จ {acc != null && `· ${Math.round(acc * 100)}%`}</span>
    if (s === 'training')
      return <span className="flex items-center gap-1 text-blue-400"><Loader2 size={12} className="animate-spin" /> กำลังเทรน</span>
    if (s === 'failed')
      return <span className="text-red-400">ล้มเหลว</span>
    return <span className="flex items-center gap-1 text-zinc-500"><Clock size={12} /> ร่าง</span>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <h1 className="text-lg font-bold text-white">PhoenixFlow</h1>
          {version && <span className="text-[11px] text-zinc-600">v{version}</span>}
        </div>
        <div className="flex items-center gap-2">
          {me?.role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-violet-300 text-sm rounded-lg transition-colors"
            >
              <ShieldCheck size={14} /> จัดการผู้ใช้
            </button>
          )}
          {me && (
            <span className="hidden sm:flex items-center gap-2 px-2 text-sm text-zinc-400">
              {me.picture ? (
                <img src={me.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs">
                  {me.name?.[0]?.toUpperCase()}
                </span>
              )}
              <span className="max-w-[140px] truncate">{me.name}</span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm rounded-lg transition-colors"
            title="ออกจากระบบ"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400 p-6">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : (
        <main className="p-6 space-y-10 max-w-6xl mx-auto">
          {/* ── 1. บล็อค AI ── */}
          <Section
            icon={<Blocks size={18} className="text-violet-400" />}
            title="บล็อค AI"
            subtitle="ลากบล็อกสร้าง AI workflow บน canvas"
            onCreate={createFlow}
            createLabel="สร้างโปรเจกต์"
            busy={busy}
            empty={projects.length === 0 ? 'ยังไม่มีโปรเจกต์' : null}
          >
            {projects.map((p) => (
              <Card
                key={p.id}
                title={p.name}
                desc={p.description || 'คลิกเพื่อเขียน blocks'}
                icon={<FolderOpen size={20} className="text-violet-400" />}
                onClick={() => openFlow(p.id, p.name)}
                onDelete={(e) => deleteFlow(e, p.id)}
              />
            ))}
          </Section>

          {/* ── 2. TrainAI Classification ── */}
          <Section
            icon={<Tags size={18} className="text-emerald-400" />}
            title="TrainAI · จำแนกภาพ"
            subtitle="สอน AI ให้แยกประเภทภาพ — ถ่าย/อัปโหลดรูปแล้วเทรนได้เลย"
            onCreate={createClassify}
            createLabel="สร้างโมเดลจำแนกภาพ"
            accent="emerald"
            busy={busy}
            empty={clsProjects.length === 0 ? 'ยังไม่มีโมเดล' : null}
          >
            {clsProjects.map((p) => (
              <Card
                key={p.id}
                title={p.name}
                desc={p.classes ? `${Object.keys(p.classes).length} คลาส` : ''}
                badge={statusBadge(p.status, p.accuracy)}
                icon={<Tags size={20} className="text-emerald-400" />}
                accent="emerald"
                onClick={() => router.push(`/train/classify/${p.id}`)}
                onDelete={(e) => deleteClassify(e, p.id)}
              />
            ))}
          </Section>

          {/* ── 3. TrainAI Detection ── */}
          <Section
            icon={<Crosshair size={18} className="text-amber-400" />}
            title="TrainAI · ตรวจจับวัตถุ"
            subtitle="สอน AI ให้ตรวจจับวัตถุพร้อมตีกรอบ — วาดเอง หรือให้ AI ช่วยตีกรอบ"
            onCreate={createDetect}
            createLabel="สร้างโมเดลตรวจจับ"
            accent="amber"
            busy={busy}
            empty={detProjects.length === 0 ? 'ยังไม่มีโมเดล' : null}
          >
            {detProjects.map((p) => (
              <Card
                key={p.id}
                title={p.name}
                desc={p.classes ? `${Object.keys(p.classes).length} คลาส` : ''}
                badge={statusBadge(p.status, p.accuracy)}
                icon={<Crosshair size={20} className="text-amber-400" />}
                accent="amber"
                onClick={() => router.push(`/train/detect/${p.id}`)}
                onDelete={(e) => deleteDetect(e, p.id)}
              />
            ))}
          </Section>
        </main>
      )}
    </div>
  )
}

// ───────────────────────── sub-components ─────────────────────────
const ACCENT = {
  violet: 'bg-violet-600 hover:bg-violet-500',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
  amber: 'bg-amber-600/40 text-amber-300',
}

function Section({
  icon, title, subtitle, onCreate, createLabel, busy, empty, accent = 'violet', disabled, children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onCreate?: () => void
  createLabel: string
  busy?: boolean
  empty?: string | null
  accent?: keyof typeof ACCENT
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={onCreate}
          disabled={disabled || busy}
          className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ACCENT[accent]}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {createLabel}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
      {empty && (
        <div className="text-sm text-zinc-600 italic py-6">{empty}</div>
      )}
    </section>
  )
}

function Card({
  title, desc, icon, badge, onClick, onDelete, accent = 'violet',
}: {
  title: string
  desc: string
  icon: React.ReactNode
  badge?: React.ReactNode
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  accent?: 'violet' | 'emerald' | 'amber'
}) {
  const hover = accent === 'emerald' ? 'hover:border-emerald-500'
    : accent === 'amber' ? 'hover:border-amber-500'
    : 'hover:border-violet-500'
  return (
    <button
      onClick={onClick}
      className={`text-left p-5 bg-zinc-900 border border-zinc-800 ${hover} rounded-xl transition-all group relative`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-zinc-800 rounded-lg">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-100 truncate">{title}</h3>
          <p className="text-xs text-zinc-500 mt-1 truncate">{desc}</p>
          {badge && <div className="text-[11px] mt-2">{badge}</div>}
        </div>
        <span
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-md text-zinc-500 hover:text-red-400 transition-all"
          title="ลบ"
        >
          <Trash2 size={14} />
        </span>
      </div>
    </button>
  )
}
