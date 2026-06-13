'use client'

import { Logo } from '@/components/Logo'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <Logo size={72} />
          <h1 className="text-2xl font-bold text-white mt-3">PhoenixFlow</h1>
          <p className="text-zinc-400 mt-1 text-sm">AI Block-based Platform</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">เข้าสู่ระบบ</h2>
          <p className="text-sm text-zinc-500 mb-6">ใช้บัญชี Google เพื่อเข้าใช้งาน</p>

          <GoogleSignInButton />

          <p className="text-center text-xs text-zinc-600 mt-6">
            ผู้ใช้ใหม่ต้องรอผู้ดูแลระบบอนุมัติก่อนใช้งาน
          </p>
        </div>
      </div>
    </div>
  )
}
