'use client'

import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { ExtensionsPanel } from './ExtensionsPanel'

// Footer button at the bottom of the tool palette. Opens the Extensions
// drawer where the user can stash / un-stash block categories. Shows a count
// of currently-stashed categories when > 0.
export function ExtensionsButton({ allCategoryLabels }: { allCategoryLabels: string[] }) {
  const [open, setOpen] = useState(false)
  const hiddenCount = useExtensionsStore((s) => s.hidden.length)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Extensions — จัดเก็บหมวดบล็อค"
        className="relative w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-violet-600 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
      >
        <LayoutGrid size={13} className="text-violet-400" />
        <span>Extensions</span>
        {hiddenCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400 tabular-nums">
            {hiddenCount}
          </span>
        )}
      </button>

      <ExtensionsPanel
        open={open}
        onClose={() => setOpen(false)}
        allCategoryLabels={allCategoryLabels}
      />
    </>
  )
}
