'use client'

import { useState } from 'react'
import { Cable } from 'lucide-react'
import { useArduinoStore } from '@/stores/arduinoStore'
import { ConnectorPanel } from './ConnectorPanel'
import { cn } from '@/lib/utils'

// Top-bar button that opens the board-connection dialog (Arduino Connect /
// Flash etc.). Shows a small green dot when any board is connected.
export function ConnectorButton({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const [open, setOpen] = useState(false)
  const arduinoConnected = useArduinoStore((s) => s.state === 'connected')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Connector — เชื่อมต่อบอร์ด"
        className={cn(
          'relative inline-flex items-center gap-1.5 rounded-md transition-colors',
          variant === 'compact'
            ? 'p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
            : 'px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm',
        )}
      >
        <Cable size={variant === 'compact' ? 15 : 14} />
        {variant !== 'compact' && <span>Connector</span>}
        {arduinoConnected && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-zinc-900"
            title="Arduino UNO connected"
          />
        )}
      </button>

      <ConnectorPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
