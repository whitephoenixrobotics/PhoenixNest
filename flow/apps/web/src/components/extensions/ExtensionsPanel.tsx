'use client'

import { createPortal } from 'react-dom'
import { X, LayoutGrid, Plus, Minus } from 'lucide-react'
import { CategoryIcon } from '@/components/nodes/BlockIcons'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  // Caller passes the toggleable category labels (NodePalette already filters
  // BLOCK_CATEGORIES against TOGGLEABLE_CATEGORIES for us).
  allCategoryLabels: string[]
}

// Extensions drawer — one row per toggleable category. The button on the
// right flips between green (+) when hidden and red (−) when visible, so a
// single click moves the category in or out of the palette.
export function ExtensionsPanel({ open, onClose, allCategoryLabels }: Props) {
  const hidden = useExtensionsStore((s) => s.hidden)
  const toggle = useExtensionsStore((s) => s.toggle)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-violet-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">Extensions</h2>
              <p className="text-xs text-zinc-500 mt-0.5">เพิ่ม / เอาหมวดบล็อคออกจากแท็บเครื่องมือ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-1.5">
          {allCategoryLabels.map((label) => {
            const isHidden = hidden.includes(label)
            return (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/70 border border-zinc-700"
              >
                <CategoryIcon name={label} size={14} className="text-violet-400" />
                <span className="flex-1 text-sm text-zinc-200">{label}</span>
                <button
                  onClick={() => toggle(label)}
                  title={isHidden ? 'เพิ่มเข้าแท็บเครื่องมือ' : 'เอาออกจากแท็บเครื่องมือ'}
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-md text-white transition-colors',
                    isHidden
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-red-600 hover:bg-red-500',
                  )}
                >
                  {isHidden ? <Plus size={14} /> : <Minus size={14} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
