'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, ShieldCheck, ShieldOff, Check, Ban, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getProfile, type UserRole, type UserStatus } from '@/lib/auth'

interface ProfileRow {
  id: string
  email: string
  name: string
  picture?: string | null
  role: UserRole
  status: UserStatus
  created_at?: string
}

type Filter = UserStatus | 'all'

const TABS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'รออนุมัติ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'rejected', label: 'ถูกปฏิเสธ' },
  { key: 'all', label: 'ทั้งหมด' },
]

export default function AdminPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [denied, setDenied] = useState(false)
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Guard: must be a signed-in admin.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }
      const me = await getProfile()
      if (!me || me.role !== 'admin') setDenied(true)
      setAuthChecked(true)
    })
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('profiles')
      .select('id,email,name,picture,role,status,created_at')
      .order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data, error } = await query
    if (error) setDenied(true)
    else setUsers((data as ProfileRow[]) ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    if (authChecked && !denied) load()
  }, [authChecked, denied, load])

  async function patch(id: string, fields: Partial<Pick<ProfileRow, 'status' | 'role'>>) {
    setBusyId(id)
    await supabase.from('profiles').update(fields).eq('id', id)
    await load()
    setBusyId(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white cursor-pointer"
        >
          <ArrowLeft size={16} /> กลับ Hub
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <ShieldCheck size={18} className="text-violet-400" />
        <h1 className="text-base font-semibold text-white">จัดการผู้ใช้</h1>
      </header>

      <main className="flex-1 p-6">
        {denied ? (
          <div className="text-center py-20 text-zinc-400">
            <ShieldOff className="mx-auto mb-3 text-red-400" size={32} />
            <p>คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลระบบ)</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                    filter === t.key ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="flex items-center gap-2 text-zinc-400">
                <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
              </p>
            ) : users.length === 0 ? (
              <p className="text-zinc-500 text-sm py-10 text-center">ไม่มีผู้ใช้ในหมวดนี้</p>
            ) : (
              <div className="flex flex-col gap-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800"
                  >
                    {u.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.picture} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
                        {u.name?.[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{u.name}</span>
                        {u.role === 'admin' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">
                            admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                    </div>
                    <StatusBadge status={u.status} />
                    <div className="flex items-center gap-1.5">
                      {busyId === u.id ? (
                        <Loader2 size={16} className="animate-spin text-zinc-400" />
                      ) : (
                        <>
                          {u.status !== 'approved' && (
                            <button
                              onClick={() => patch(u.id, { status: 'approved' })}
                              title="อนุมัติ"
                              className="p-1.5 rounded-lg bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 cursor-pointer"
                            >
                              <Check size={15} />
                            </button>
                          )}
                          {u.status !== 'rejected' && (
                            <button
                              onClick={() => patch(u.id, { status: 'rejected' })}
                              title="ปฏิเสธ"
                              className="p-1.5 rounded-lg bg-red-600/15 text-red-400 hover:bg-red-600/25 cursor-pointer"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                            title={u.role === 'admin' ? 'ถอดสิทธิ์แอดมิน' : 'ตั้งเป็นแอดมิน'}
                            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                          >
                            {u.role === 'admin' ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
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

function StatusBadge({ status }: { status: UserStatus }) {
  const map = {
    approved: { cls: 'bg-emerald-500/15 text-emerald-400', icon: <Check size={12} />, label: 'approved' },
    rejected: { cls: 'bg-red-500/15 text-red-400', icon: <Ban size={12} />, label: 'rejected' },
    pending: { cls: 'bg-amber-500/15 text-amber-400', icon: <Clock size={12} />, label: 'pending' },
  }[status]
  return (
    <span className={`hidden sm:flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${map.cls}`}>
      {map.icon} {map.label}
    </span>
  )
}
