'use client'

import { Handle, Position } from '@xyflow/react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'

const OPS = [
  { op: '+', label: 'บวก' },
  { op: '-', label: 'ลบ' },
  { op: '*', label: 'คูณ' },
  { op: '/', label: 'หาร' },
  { op: '%', label: 'หารเอาเศษ' },
]

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function MathOpNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; text?: string; a?: number; b?: number }
    | undefined

  const operator = (data.config?.operator as string) ?? '+'

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-zinc-900 transition-all min-w-[180px] border-zinc-700',
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50">
        <span className="text-lg">➕</span>
        <span className="text-sm font-semibold text-zinc-100 flex-1">{data.label}</span>
      </div>

      {/* Body — picker + result */}
      <div className="p-2 space-y-1.5">
        <select
          value={operator}
          onChange={(e) => updateNodeConfig(id, { operator: e.target.value })}
          className="nodrag w-full text-center text-sm font-bold bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-violet-300 focus:outline-none focus:border-violet-500"
        >
          {OPS.map(({ op, label }) => (
            <option key={op} value={op}>{op}  {label}</option>
          ))}
        </select>

        {/* Inline expression */}
        <div className="flex items-center justify-center gap-2 bg-zinc-800 rounded py-1.5 px-2">
          <span className="text-sm font-mono text-zinc-400 tabular-nums">
            {output?.a ?? '?'}
          </span>
          <span className="text-sm font-bold text-violet-300">{operator}</span>
          <span className="text-sm font-mono text-zinc-400 tabular-nums">
            {output?.b ?? '?'}
          </span>
          <span className="text-zinc-500">=</span>
          <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
            {output?.text ?? '—'}
          </span>
        </div>
      </div>

      <Handle id="a" type="target" position={Position.Left} style={{ top: '40%' }}
        className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400" />
      <Handle id="b" type="target" position={Position.Left} style={{ top: '75%' }}
        className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400" />
      <Handle type="source" position={Position.Right}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-700 hover:!bg-violet-400" />
    </div>
  )
}
