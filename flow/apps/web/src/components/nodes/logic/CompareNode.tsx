'use client'

import { Handle, Position } from '@xyflow/react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { TextInput } from '@/components/ui/StableField'

const OPERATORS = ['=', '!=', 'contains', '>', '<', '>=', '<=']

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function CompareNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { result?: boolean; a?: string; b?: string }
    | undefined

  const operator = (data.config?.operator as string) ?? '='
  const value = (data.config?.value as string) ?? ''
  const result = output?.result

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-zinc-900 transition-all min-w-[200px]',
        result === true  ? 'border-emerald-500' :
        result === false ? 'border-red-500' : 'border-zinc-700',
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50">
        <span className="text-lg">⚖️</span>
        <span className="text-sm font-semibold text-zinc-100 flex-1">{data.label}</span>
        {result !== undefined && (
          <span className={cn(
            'text-[10px] font-bold font-mono px-1.5 rounded',
            result ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          )}>
            {result ? 'T' : 'F'}
          </span>
        )}
      </div>

      <div className="p-2 space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 w-3">A</span>
          <div className="flex-1 text-[10px] font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded truncate">
            {output?.a ?? '—'}
          </div>
        </div>

        <select
          value={operator}
          onChange={(e) => updateNodeConfig(id, { operator: e.target.value })}
          className="nodrag w-full text-center text-xs font-bold bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-violet-300 focus:outline-none focus:border-violet-500"
        >
          {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 w-3">B</span>
          <TextInput
            type="text"
            value={value}
            onChange={(e) => updateNodeConfig(id, { value: e.target.value })}
            placeholder={output?.b ?? 'ค่า หรือต่อ input'}
            className="nodrag flex-1 text-[10px] font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-500 placeholder-zinc-600"
          />
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
