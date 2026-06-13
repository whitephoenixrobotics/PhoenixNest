// Auth helpers backed by Supabase (session + profiles table).
import { supabase } from './supabase'

export type UserRole = 'user' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export interface AuthUser {
  id: string
  email: string
  name: string
  picture?: string | null
  role: UserRole
  status: UserStatus
}

/** Current Supabase access token (for backend Authorization / WebSocket ?token). */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** The signed-in user's profile (role + approval status). Null if not signed in. */
export async function getProfile(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id,email,name,picture,role,status')
    .eq('id', user.id)
    .single()

  if (data) return data as AuthUser

  // Profile row may lag right after first sign-in (trigger) — treat as pending.
  return {
    id: user.id,
    email: user.email ?? '',
    name: (user.user_metadata?.full_name as string) ?? user.email ?? 'user',
    picture: (user.user_metadata?.avatar_url as string) ?? null,
    role: 'user',
    status: 'pending',
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** Where an authenticated user should land based on approval status. */
export function routeForStatus(status: UserStatus | undefined): string {
  return status === 'approved' ? '/' : '/pending'
}
