'use client'

import { useEffect } from 'react'

// Applies the saved theme on mount. Replaces the old inline <head> script —
// React 19 rejects raw/next-script <script> tags in the component tree, so we
// set the CSS variables from a client effect instead. globals.css already ships
// sane defaults (dark bg via page divs + a default accent), so any flash is
// negligible (accent only). Renders nothing.
type Theme = { a: string; b: string; d: string; r: string }

const THEMES: Record<string, Theme> = {
  violet: { a: '#a78bfa', b: '#c4b5fd', d: '#7c3aed', r: '167 139 250' },
  blue: { a: '#60a5fa', b: '#93c5fd', d: '#3b82f6', r: '96 165 250' },
  emerald: { a: '#34d399', b: '#6ee7b7', d: '#10b981', r: '52 211 153' },
  mono: { a: '#f4f4f5', b: '#ffffff', d: '#a1a1aa', r: '244 244 245' },
  amber: { a: '#fbbf24', b: '#fcd34d', d: '#f59e0b', r: '251 191 36' },
  kids: { a: '#ff5fb4', b: '#ff9ad4', d: '#ec3aa0', r: '255 95 180' },
}

export function ThemeInit() {
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('phoenix-theme') || 'null')
      let id: string = saved?.state?.themeId || 'mono'
      if (!THEMES[id]) id = 'mono'
      const mode: string = saved?.state?.mode || 'dark'
      const t = THEMES[id] || THEMES.mono
      const root = document.documentElement
      root.style.setProperty('--accent', t.a)
      root.style.setProperty('--accent-bright', t.b)
      root.style.setProperty('--accent-dim', t.d)
      root.style.setProperty('--accent-rgb', t.r)
      root.setAttribute('data-theme', id)
      root.setAttribute('data-mode', mode)
    } catch {
      /* ignore */
    }
  }, [])

  return null
}
