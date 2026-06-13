'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, RefreshCw, ShieldX, Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { getProfile, signOut, type AuthUser } from '@/lib/auth'

export default function PendingPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)

  const check = async () => {
    setChecking(true)
    try {
      const profile = await getProfile()
      if (!profile) {
        router.replace('/login')
        return
      }
      setUser(profile)
      if (profile.status === 'approved') router.replace('/')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check()
    const id = setInterval(check, 5000) // auto-poll for approval
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await signOut()
    router.replace('/login')
  }

  const rejected = user?.status === 'rejected'

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-8">
          <Logo size={72} />
          <h1 className="text-2xl font-bold text-white mt-3">PhoenixFlow</h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          {rejected ? (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <ShieldX className="text-red-400" size={32} />
              </div>
              <h2 className="text-lg font-semibold text-white">บัญชีถูกปฏิเสธ</h2>
              <p className="text-sm text-zinc-400 mt-2">
                บัญชี <span className="text-zinc-200">{user?.email}</span> ไม่ได้รับอนุญาตให้ใช้งาน
                กรุณาติดต่อผู้ดูแลระบบ
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                <Clock className="text-amber-400" size={32} />
              </div>
              <h2 className="text-lg font-semibold text-white">รอการอนุมัติ</h2>
              <p className="text-sm text-zinc-400 mt-2">
                บัญชี <span className="text-zinc-200">{user?.email}</span> กำลังรอผู้ดูแลระบบอนุมัติ
                หน้านี้จะเข้าสู่ระบบให้อัตโนมัติเมื่อได้รับอนุมัติ
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mt-4">
                {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                ตรวจสอบสถานะอัตโนมัติทุก 5 วินาที
              </div>
            </>
          )}

          <div className="flex gap-2 mt-6">
            {!rejected && (
              <button
                onClick={check}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors"
              >
                <RefreshCw size={14} /> ตรวจสอบเดี๋ยวนี้
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm rounded-lg transition-colors"
            >
              <LogOut size={14} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
