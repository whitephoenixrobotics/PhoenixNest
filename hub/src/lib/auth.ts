// Auth helpers backed by Supabase (same project as Flow).
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  email: string
  name: string
  picture?: string | null
}

/** Current Supabase access token — passed to module backends as Bearer token. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** The signed-in user, or null. Derived from the Supabase session. */
export async function getUser(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    name: (user.user_metadata?.full_name as string) ?? user.email ?? 'user',
    picture: (user.user_metadata?.avatar_url as string) ?? null,
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
