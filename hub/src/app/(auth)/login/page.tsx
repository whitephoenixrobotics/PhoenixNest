'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  // Already signed in? Skip straight to the hub.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <Logo size={72} />
          <div>
            <h1 className="text-2xl font-bold text-white">PhoenixNest</h1>
            <p className="text-zinc-400 mt-1 text-sm">AI Ecosystem Hub</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">เข้าสู่ระบบ</h2>
          <p className="text-sm text-zinc-500 mb-6">ใช้บัญชี Google เพื่อเข้าใช้งาน</p>
          <GoogleSignInButton />
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          บัญชีเดียว ใช้ได้ทุกโมดูลในระบบ Phoenix Nest
        </p>
      </div>
    </div>
  )
}
