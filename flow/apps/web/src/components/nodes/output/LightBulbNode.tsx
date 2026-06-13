'use client'

import { Handle, Position } from '@xyflow/react'
import { Lightbulb } from 'lucide-react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(250,204,21,${alpha})`  // yellow fallback
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function LightBulbNode({ id, data, selected }: Props) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { on?: boolean }
    | undefined
  const selectNode = useFlowStore((s) => s.selectNode)

  const color = (data.config?.color as string) || '#facc15'

  const isOn  = output?.on === true
  const isOff = output?.on === false

  return (
    <div
      onClick={() => selectNode(id)}
      className={cn(
        'rounded-2xl border-2 cursor-pointer transition-all duration-300 overflow-hidden',
        isOn
          ? 'bg-zinc-900'
          : isOff
          ? 'border-zinc-700 bg-zinc-950'
          : 'border-zinc-700 bg-zinc-900',
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950',
        status === 'skipped' && 'opacity-40'
      )}
      style={{
        minWidth: 140,
        ...(isOn && {
          borderColor: color,
          boxShadow: `0 0 32px 6px ${hexToRgba(color, 0.35)}`,
        }),
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50">
        <span className="text-sm font-semibold text-zinc-100 flex-1">{data.label}</span>
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            status === 'running' ? 'bg-blue-400 animate-ping' :
            isOff ? 'bg-zinc-600' : !isOn ? 'bg-zinc-500' : ''
          )}
          style={isOn ? { backgroundColor: color } : undefined}
        />
      </div>

      {/* Bulb */}
      <div className="relative flex flex-col items-center justify-center py-4 gap-2 select-none">
        {/* Soft glow halo */}
        {isOn && (
          <div
            className="absolute w-16 h-16 rounded-full blur-xl animate-pulse"
            style={{ backgroundColor: hexToRgba(color, 0.2) }}
          />
        )}

        {/* Bulb icon — fillable SVG so we can show any color */}
        <Lightbulb
          size={56}
          strokeWidth={1.5}
          className={cn(
            'transition-all duration-300 relative',
            isOn ? 'scale-110' : 'opacity-40 scale-100'
          )}
          style={
            isOn
              ? {
                  color,
                  fill: hexToRgba(color, 0.85),
                  filter: `drop-shadow(0 0 12px ${hexToRgba(color, 0.85)})`,
                }
              : { color: '#52525b' /* zinc-600 */, fill: 'transparent' }
          }
        />

        {/* Status text */}
        <span
          className={cn(
            'text-xs font-semibold tracking-wide',
            isOff ? 'text-zinc-600' : !isOn ? 'text-zinc-500' : ''
          )}
          style={isOn ? { color } : undefined}
        >
          {isOn ? 'ติด' : isOff ? 'ดับ' : '—'}
        </span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400"
      />
    </div>
  )
}
