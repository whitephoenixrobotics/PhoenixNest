'use client'

import { Handle, Position } from '@xyflow/react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { useArduinoStore } from '@/stores/arduinoStore'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  type: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

// One component serves all five Arduino blocks — they're visually similar
// (header with pin label, body showing the current value, in/out handles
// depending on direction). Type-specific bits are derived from `type`.
//
// Direction:
//   *_read   → no input handle, output handle on the right
//   *_write  → input handle on the left, no output (drives a real-world pin)
//   servo    → input handle (angle), output handle for chaining if desired
export function ArduinoNode({ id, type, data, selected }: Props) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { ok?: boolean; pin?: number; value?: number | boolean; angle?: number; error?: string; text?: string }
    | undefined
  const selectNode = useFlowStore((s) => s.selectNode)
  const arduinoConnected = useArduinoStore((s) => s.state === 'connected')

  const isRead  = type.endsWith('_read')
  const meta    = META_BY_TYPE[type] ?? META_BY_TYPE.arduino_digital_write
  const pin     = (data.config?.pin as number | undefined) ?? (output?.pin ?? '?')
  const pinLabel = pin === '?' ? '?' : (type === 'arduino_analog_read' ? `A${pin}` : `D${pin}`)

  let displayValue: string = '—'
  if (output && output.ok !== false) {
    if (type === 'arduino_servo' && output.angle !== undefined) displayValue = `${output.angle}°`
    else if (output.text) displayValue = output.text
    else if (output.value !== undefined) displayValue = String(output.value)
  }

  const error = output?.ok === false ? output.error : null
  const stale = !arduinoConnected

  return (
    <div
      onClick={() => selectNode(id)}
      className={cn(
        'rounded-2xl border-2 cursor-pointer transition-all overflow-hidden bg-zinc-900',
        error ? 'border-red-500' : stale ? 'border-zinc-700 opacity-70' : 'border-cyan-700/60',
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950',
        status === 'skipped' && 'opacity-40',
      )}
      style={{ minWidth: 168 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50 bg-cyan-950/30">
        <span className="text-lg leading-none">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-cyan-100 truncate">{data.label}</div>
          <div className="text-[10px] text-cyan-400/70 font-mono">pin {pinLabel}</div>
        </div>
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            status === 'running' ? 'bg-blue-400 animate-ping' :
            error ? 'bg-red-400' :
            stale ? 'bg-zinc-600' : 'bg-cyan-400',
          )}
        />
      </div>

      {/* Body */}
      <div className="px-3 py-3 text-center">
        {error ? (
          <div className="text-[11px] text-red-300 leading-tight">{error}</div>
        ) : stale ? (
          <div className="text-[11px] text-zinc-500 leading-tight">
            ยังไม่ได้เชื่อมต่อ Arduino<br/>
            <span className="text-cyan-400">(เปิด Extensions)</span>
          </div>
        ) : (
          <>
            <div className="text-xl font-bold text-zinc-100 font-mono">{displayValue}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{meta.unit}</div>
          </>
        )}
      </div>

      {/* Handles */}
      {!isRead && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-cyan-400"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-zinc-700"
      />
    </div>
  )
}

const META_BY_TYPE: Record<string, { icon: string; unit: string }> = {
  arduino_digital_read:  { icon: '🔘', unit: 'HIGH / LOW' },
  arduino_analog_read:   { icon: '📈', unit: '0–1023' },
  arduino_digital_write: { icon: '💡', unit: 'HIGH / LOW' },
  arduino_analog_write:  { icon: '🎛️', unit: '0–255 PWM' },
  arduino_servo:         { icon: '🎯', unit: 'องศา' },
}
