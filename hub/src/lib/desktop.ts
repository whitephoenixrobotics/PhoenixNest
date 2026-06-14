// Bridge to the Electron preload API (window.phoenixNest). Degrades to plain
// browser behaviour when running outside Electron.

export interface StorageEntry {
  key: string
  value: string
}

export interface OpenModuleResult {
  ok: boolean
  error?: string
}

export interface RegistryModule {
  id: string
  name: string
  icon?: string
  description?: string
  type?: 'static' | 'service'
  latest?: string
  url?: string
  sha256?: string
  size?: number
  available?: boolean
}

export interface InstalledInfo {
  version: string
  type?: 'static' | 'service'
  path?: string
  dev?: boolean
}

export type InstalledMap = Record<string, InstalledInfo>

export interface InstallProgress {
  id: string
  phase: 'download' | 'verify' | 'extract' | 'done'
  percent: number
  got?: number
  total?: number
}

export interface PhoenixNestBridge {
  isDesktop: true
  version: string
  openExternal: (url: string) => void
  openModule: (id: string, storage: StorageEntry[]) => Promise<OpenModuleResult>
  closeModule: () => Promise<{ ok: boolean }>
  getRegistry: () => Promise<{ ok: boolean; error?: string; registry: { modules: RegistryModule[] } }>
  getInstalled: () => Promise<InstalledMap>
  installModule: (id: string) => Promise<{ ok: boolean; error?: string }>
  uninstallModule: (id: string) => Promise<{ ok: boolean; error?: string }>
  onInstallProgress: (cb: (p: InstallProgress) => void) => () => void
}

/** Collect the Supabase session entries to hand to an embedded module. */
export function collectSupabaseStorage(): StorageEntry[] {
  if (typeof window === 'undefined') return []
  const out: StorageEntry[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('sb-')) {
      const value = localStorage.getItem(key)
      if (value != null) out.push({ key, value })
    }
  }
  return out
}

export async function openModule(id: string): Promise<OpenModuleResult> {
  if (!window.phoenixNest?.openModule) return { ok: false, error: 'ต้องเปิดผ่านแอป PhoenixNest' }
  return window.phoenixNest.openModule(id, collectSupabaseStorage())
}

export async function closeModule(): Promise<void> {
  await window.phoenixNest?.closeModule?.()
}

declare global {
  interface Window {
    phoenixNest?: PhoenixNestBridge
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.phoenixNest?.isDesktop
}

export function desktopVersion(): string | null {
  if (typeof window === 'undefined') return null
  return window.phoenixNest?.version ?? null
}

export function openExternal(url: string) {
  if (typeof window === 'undefined') return
  if (window.phoenixNest?.openExternal) window.phoenixNest.openExternal(url)
  else window.open(url, '_blank')
}
