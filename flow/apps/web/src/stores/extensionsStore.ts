import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// "Extensions" = the drawer that holds block categories the user wants to keep
// OUT of the main tool palette (to reduce clutter). This store tracks which
// category labels are currently stashed there. The list is keyed by
// BLOCK_CATEGORIES[].label (e.g. "Arduino").

interface ExtensionsState {
  // Categories that should NOT appear in the palette right now. The user can
  // bring them back from the Extensions drawer at any time.
  hidden: string[]
  hide: (label: string) => void
  unhide: (label: string) => void
  toggle: (label: string) => void
  isHidden: (label: string) => boolean

  // Whether the entire tool palette sidebar is collapsed (canvas gets full
  // width). Lives in this store because the persistence key already covers
  // palette layout preferences.
  paletteCollapsed: boolean
  togglePalette: () => void
}

// The Extensions drawer only lets the user toggle THESE categories — the
// others are core tools that always stay in the palette. Labels must match
// BLOCK_CATEGORIES[].label in NodePalette.tsx exactly.
export const TOGGLEABLE_CATEGORIES = [
  'ข้อมูล',
  'AI · ใบหน้า',
  'Deep Learning',
  'Arduino',
  'LINE',
] as const

// All toggleable categories start hidden so a fresh user sees a tidy palette;
// they opt in to whatever they actually need from the Extensions drawer.
const DEFAULT_HIDDEN: string[] = [...TOGGLEABLE_CATEGORIES]

export const useExtensionsStore = create<ExtensionsState>()(
  persist(
    (set, get) => ({
      hidden: DEFAULT_HIDDEN,
      hide: (label) =>
        set((s) => (s.hidden.includes(label) ? s : { hidden: [...s.hidden, label] })),
      unhide: (label) =>
        set((s) => ({ hidden: s.hidden.filter((x) => x !== label) })),
      toggle: (label) =>
        set((s) => ({
          hidden: s.hidden.includes(label)
            ? s.hidden.filter((x) => x !== label)
            : [...s.hidden, label],
        })),
      isHidden: (label) => get().hidden.includes(label),

      paletteCollapsed: false,
      togglePalette: () =>
        set((s) => ({ paletteCollapsed: !s.paletteCollapsed })),
    }),
    { name: 'phoenix-extensions' },
  ),
)
