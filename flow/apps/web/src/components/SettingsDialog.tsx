'use client'

import { createPortal } from 'react-dom'
import { X, Check, Moon, Sun } from 'lucide-react'
import { useThemeStore, THEMES } from '@/stores/themeStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: Props) {
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  // Portal needs a DOM target; only render client-side when open
  if (!open || typeof document === 'undefined') return null

  // Render at <body> root so React Flow's stacking context can't trap us
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100">ตั้งค่า</h2>
            <p className="text-xs text-zinc-500 mt-0.5">ปรับแต่งหน้าตา PhoenixFlow</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Dark / Light mode */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">โหมดสี</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('dark')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all text-sm font-medium',
                  mode === 'dark'
                    ? 'border-violet-500 bg-zinc-800/60 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700'
                )}
              >
                <Moon size={15} /> มืด
              </button>
              <button
                onClick={() => setMode('light')}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all text-sm font-medium',
                  mode === 'light'
                    ? 'border-violet-500 bg-zinc-800/60 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700'
                )}
              >
                <Sun size={15} /> สว่าง
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">ธีมสี</h3>
            <div className="grid grid-cols-1 gap-2">
              {THEMES.map((theme) => {
                const selected = theme.id === themeId
                return (
                  <button
                    key={theme.id}
                    onClick={() => setTheme(theme.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left',
                      selected
                        ? 'border-zinc-500 bg-zinc-800/60'
                        : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700 hover:bg-zinc-800/60'
                    )}
                    style={selected ? { borderColor: theme.accent } : undefined}
                  >
                    {/* Color swatches */}
                    <div className="flex gap-1">
                      <span
                        className="w-6 h-6 rounded-full ring-2 ring-zinc-900"
                        style={{ backgroundColor: theme.accentDim }}
                      />
                      <span
                        className="w-6 h-6 rounded-full ring-2 ring-zinc-900 -ml-3"
                        style={{ backgroundColor: theme.accent }}
                      />
                      <span
                        className="w-6 h-6 rounded-full ring-2 ring-zinc-900 -ml-3"
                        style={{ backgroundColor: theme.accentBright }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-100">
                          {theme.name}
                        </span>
                        <span className="text-xs">{theme.emoji}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">{theme.description}</div>
                    </div>

                    {selected && (
                      <Check size={16} style={{ color: theme.accent }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-500 text-center">
          ⚙️ การตั้งค่าจะถูกบันทึกไว้ในเครื่องของคุณ
        </div>
      </div>
    </div>,
    document.body
  )
}
