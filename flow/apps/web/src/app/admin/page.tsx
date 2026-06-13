'use client'
/* eslint-disable @next/next/no-img-element -- remote Google avatars; next/image optimization is unnecessary in the desktop shell */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, X, Loader2, ShieldCheck, Shield, Clock, CheckCircle2, Ban,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { supabase } from '@/lib/supabase'
import { getProfile } from '@/lib/auth'

interface AdminUser {
  id: string
  email: string
  name: string
  picture?: string | null
  role: 'user' | 'admin'
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string | null
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all'

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('profiles')
        .select('id,email,name,picture,role,status,created_at')
        .order('created_at', { ascending: false })
      if (filter !== 'all') query = query.eq('status', filter)
      const { data, error } = await query
      if (error) {
        setDenied(true)
      } else {
        setUsers((data ?? []) as AdminUser[])
        setDenied(false)
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    // Guard: must be an approved admin.
    getProfile().then((p) => {
      if (!p) {
        router.replace('/login')
        return
      }
      if (p.role !== 'admin') {
        setDenied(true)
        setLoading(false)
        return
      }
      load()
    })
  }, [load, router])

  const patch = async (id: string, fields: Partial<AdminUser>) => {
    setBusyId(id)
    try {
      await supabase.from('profiles').update(fields).eq('id', id)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const tabs: { key: Filter; label: string; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'รออนุมัติ', icon: <Clock size={14} /> },
    { key: 'approved', label: 'อนุมัติแล้ว', icon: <CheckCircle2 size={14} /> },
    { key: 'rejected', label: 'ถูกปฏิเสธ', icon: <Ban size={14} /> },
    { key: 'all', label: 'ทั้งหมด', icon: null },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title="กลับ">
            <ArrowLeft size={16} />
          </button>
          <Logo size={24} />
          <h1 className="text-lg font-bold text-white">จัดการผู้ใช้</h1>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {denied ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400">
            <Shield className="mx-auto mb-3 text-zinc-600" size={32} />
            คุณไม่มีสิทธิ์เข้าหน้านี้ (เฉพาะผู้ดูแลระบบ)
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filter === t.key ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-zinc-400 py-6">
                <Loader2 size={16} className="animate-spin" /> Loading...
              </div>
            ) : users.length === 0 ? (
              <div className="text-zinc-600 italic py-8 text-center">ไม่มีผู้ใช้ในหมวดนี้</div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    {u.picture ? (
                      <img src={u.picture} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm">
                        {u.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-100 truncate">{u.name}</span>
                        {u.role === 'admin' && (
                          <span className="flex items-center gap-1 text-[11px] text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded">
                            <ShieldCheck size={11} /> admin
                          </span>
                        )}
                        <StatusBadge status={u.status} />
                      </div>
                      <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {busyId === u.id ? (
                        <Loader2 size={16} className="animate-spin text-zinc-500" />
                      ) : (
                        <>
                          {u.status !== 'approved' && (
                            <button
                              onClick={() => patch(u.id, { status: 'approved' })}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs rounded-lg"
                            >
                              <Check size={13} /> อนุมัติ
                            </button>
                          )}
                          {u.status !== 'rejected' && (
                            <button
                              onClick={() => patch(u.id, { status: 'rejected' })}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-300 text-xs rounded-lg"
                            >
                              <X size={13} /> ปฏิเสธ
                            </button>
                          )}
                          <button
                            onClick={() => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg"
                            title={u.role === 'admin' ? 'ปลดสิทธิ์แอดมิน' : 'ตั้งเป็นแอดมิน'}
                          >
                            {u.role === 'admin' ? 'ปลดแอดมิน' : 'ตั้งแอดมิน'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: AdminUser['status'] }) {
  if (status === 'approved')
    return <span className="text-[11px] text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">approved</span>
  if (status === 'rejected')
    return <span className="text-[11px] text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded">rejected</span>
  return <span className="text-[11px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">pending</span>
}
