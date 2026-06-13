'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Sign-up happens via Google on the login page now — redirect there.
export default function RegisterPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/login')
  }, [router])
  return <div className="min-h-screen bg-zinc-950" />
}
