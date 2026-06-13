'use client'

import { useEffect, useState } from 'react'
import { Keyboard } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

// Map browser KeyboardEvent.code/key to display label
function keyLabel(k: string): string {
  if (k === ' ' || k === 'Space') return 'Space'
  if (k.startsWith('Key')) return k.slice(3)
  if (k.startsWith('Digit')) return k.slice(5)
  return k
}

export function HotkeyNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const key = (data.config?.key as string) ?? 'Space'
  const pressed = data.config?.pressed === true
  const [listening, setListening] = useState(false)

  // Capture next key press to bind the hotkey
  useEffect(() => {
    if (!listening) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const captured = e.code || e.key
      updateNodeConfig(id, { key: captured })
      setListening(false)
    }
    window.addEventListener('keydown', handler, { once: true })
    return () => window.removeEventListener('keydown', handler)
  }, [listening, id, updateNodeConfig])

  // Listen for the bound hotkey globally and toggle pressed state
  useEffect(() => {
    if (listening) return // don't fire while binding
    const matches = (e: KeyboardEvent) => {
      const c = e.code || e.key
      if (c === key) return true
      if (key === 'Space' && (e.code === 'Space' || e.key === ' ')) return true
      return false
    }
    const onDown = (e: KeyboardEvent) => {
      if (matches(e) && !e.repeat) {
        // Don't trigger when typing in inputs
        const t = e.target as HTMLElement
        if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
        updateNodeConfig(id, { pressed: true })
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (matches(e)) updateNodeConfig(id, { pressed: false })
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [key, listening, id, updateNodeConfig])

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="hotkey" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[160px] space-y-1.5 py-1">
        <button
          onClick={(e) => { e.stopPropagation(); setListening(true) }}
          className={cn(
            'nodrag w-full flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border-2 transition-colors',
            listening
              ? 'border-amber-500 bg-amber-500/10 animate-pulse'
              : pressed
              ? 'border-emerald-500 bg-emerald-500/15'
              : 'border-zinc-700 bg-zinc-800 hover:border-violet-500'
          )}
        >
          <Keyboard size={14} className={pressed ? 'text-emerald-400' : 'text-zinc-500'} />
          <span className={cn(
            'text-base font-mono font-bold',
            listening ? 'text-amber-400'
              : pressed ? 'text-emerald-400'
              : 'text-zinc-300'
          )}>
            {listening ? 'กดปุ่ม…' : keyLabel(key)}
          </span>
        </button>
        <div className="text-[10px] text-zinc-500 text-center">
          {pressed ? '✓ กำลังกด' : 'คลิกเพื่อเปลี่ยน hotkey'}
        </div>
      </div>
    </BaseNode>
  )
}
