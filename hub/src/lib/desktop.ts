// Bridge to the Electron preload API (window.phoenixNest). Degrades to plain
// browser behaviour when running outside Electron.

export interface PhoenixNestBridge {
  isDesktop: true
  version: string
  openExternal: (url: string) => void
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
