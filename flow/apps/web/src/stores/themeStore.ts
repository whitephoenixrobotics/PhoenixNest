import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Theme {
  id: string
  name: string
  emoji: string
  description: string
  // Hex colors used to drive CSS variables
  accent: string        // primary
  accentBright: string  // hover/highlight
  accentDim: string     // subdued backgrounds
}

export const THEMES: Theme[] = [
  {
    id: 'mono',
    name: 'White Phoenix',
    emoji: '🤍',
    description: 'ขาวดำ เรียบหรู ดูแพง (ค่าเริ่มต้น)',
    accent: '#f4f4f5',
    accentBright: '#ffffff',
    accentDim: '#a1a1aa',
  },
  {
    id: 'violet',
    name: 'Violet',
    emoji: '🟣',
    description: 'สีม่วง',
    accent: '#a78bfa',
    accentBright: '#c4b5fd',
    accentDim: '#7c3aed',
  },
  {
    id: 'blue',
    name: 'Ocean',
    emoji: '🔵',
    description: 'สีฟ้ามหาสมุทร',
    accent: '#60a5fa',
    accentBright: '#93c5fd',
    accentDim: '#3b82f6',
  },
  {
    id: 'emerald',
    name: 'Forest',
    emoji: '🟢',
    description: 'สีเขียวป่า',
    accent: '#34d399',
    accentBright: '#6ee7b7',
    accentDim: '#10b981',
  },
  {
    id: 'amber',
    name: 'Phoenix',
    emoji: '🔥',
    description: 'สีไฟฟีนิกซ์',
    accent: '#fbbf24',
    accentBright: '#fcd34d',
    accentDim: '#f59e0b',
  },
  {
    id: 'kids',
    name: 'Kids',
    emoji: '🌈',
    description: 'สดใสน่ารักสำหรับเด็ก',
    accent: '#ff5fb4',       // bright pink
    accentBright: '#ff9ad4',
    accentDim: '#ec3aa0',
  },
]

/** Themes that switch the UI into the playful "kids" presentation. */
export const KIDS_THEMES = new Set(['kids'])

export type ColorMode = 'dark' | 'light'

interface ThemeStore {
  themeId: string
  mode: ColorMode
  setTheme: (id: string) => void
  setMode: (mode: ColorMode) => void
}

function hexToRgbParts(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '167 139 250'
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-bright', theme.accentBright)
  root.style.setProperty('--accent-dim', theme.accentDim)
  root.style.setProperty('--accent-rgb', hexToRgbParts(theme.accent))
  root.setAttribute('data-theme', theme.id)
}

function applyMode(mode: ColorMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-mode', mode)
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeId: 'mono',
      mode: 'dark',
      setTheme: (id) => {
        const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
        applyTheme(theme)
        set({ themeId: theme.id })
      },
      setMode: (mode) => {
        applyMode(mode)
        set({ mode })
      },
    }),
    {
      name: 'phoenix-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const theme = THEMES.find((t) => t.id === state.themeId) ?? THEMES[0]
          applyTheme(theme)
          applyMode(state.mode ?? 'dark')
        }
      },
    }
  )
)
