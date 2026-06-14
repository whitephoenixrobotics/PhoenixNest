'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUser, type AuthUser } from '@/lib/auth'
import { HubView } from '@/components/HubView'

// The hub is the post-login landing. Guard it: no session → /login.
export default function HubPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login')
        return
      }
      setUser(await getUser())
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return <HubView user={user} />
}
