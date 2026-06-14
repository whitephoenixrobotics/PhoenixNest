'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { supabase } from '@/lib/supabase'

// Supabase exchanges the ?code in the URL for a session automatically
// (detectSessionInUrl). Wait for the session, then enter the hub.
export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      router.replace('/')
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) finish()
    })
    const timer = setTimeout(() => {
      if (!done) setError('เข้าสู่ระบบไม่สำเร็จ — ลองใหม่อีกครั้ง')
    }, 12000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-zinc-300">
      <Logo size={64} />
      {error ? (
        <>
          <p className="text-red-400">{error}</p>
          <button onClick={() => router.replace('/login')} className="text-violet-400 hover:text-violet-300 text-sm">
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" /> กำลังเข้าสู่ระบบ...
        </p>
      )}
    </div>
  )
}
