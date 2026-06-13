// Bridge to the Electron preload API (window.phoenix). All functions degrade
// gracefully to no-ops / web behaviour when running in a plain browser.

export interface UpdateInfo {
  event: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface PhoenixBridge {
  isDesktop: true
  version: string
  /** Installer edition baked in at build time: 'CPU' or 'GPU'. */
  edition: 'CPU' | 'GPU' | ''
  /** Backend URL chosen at app launch (packaged: dynamic port; dev: ''). */
  apiUrl: string
  /** WebSocket URL (same as apiUrl but ws://). */
  wsUrl: string
  openExternal: (url: string) => void
  onAuthToken: (cb: (data: { token: string; status: string }) => void) => void
  onUpdate: (cb: (info: UpdateInfo) => void) => void
  quitAndInstall: () => void
  checkForUpdates: () => void
}

declare global {
  interface Window {
    phoenix?: PhoenixBridge
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.phoenix?.isDesktop
}

export function desktopVersion(): string | null {
  if (typeof window === 'undefined') return null
  return window.phoenix?.version ?? null
}

export function desktopEdition(): 'CPU' | 'GPU' | null {
  if (typeof window === 'undefined') return null
  const e = window.phoenix?.edition
  return e === 'CPU' || e === 'GPU' ? e : null
}

/** Runtime backend URL injected by the Electron preload (packaged builds use a
 * dynamic port). Returns empty string in dev / web so callers fall back to
 * NEXT_PUBLIC_API_URL. */
export function runtimeApiUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.phoenix?.apiUrl || ''
}

export function runtimeWsUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.phoenix?.wsUrl || ''
}

export function openExternal(url: string) {
  if (typeof window === 'undefined') return
  if (window.phoenix?.openExternal) window.phoenix.openExternal(url)
  else window.open(url, '_blank')
}

export function onAuthToken(cb: (data: { token: string; status: string }) => void) {
  if (typeof window !== 'undefined' && window.phoenix?.onAuthToken) {
    window.phoenix.onAuthToken(cb)
  }
}

export function onUpdate(cb: (info: UpdateInfo) => void) {
  if (typeof window !== 'undefined' && window.phoenix?.onUpdate) {
    window.phoenix.onUpdate(cb)
  }
}

export function quitAndInstall() {
  window.phoenix?.quitAndInstall()
}

export function checkForUpdates() {
  window.phoenix?.checkForUpdates()
}
