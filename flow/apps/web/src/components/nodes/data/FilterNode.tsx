'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const OPS = [
  { v: '=', label: '=' }, { v: '!=', label: '≠' },
  { v: '>', label: '>' }, { v: '<', label: '<' },
  { v: '>=', label: '≥' }, { v: '<=', label: '≤' },
  { v: 'contains', label: 'มีคำว่า' },
  { v: 'starts', label: 'ขึ้นต้นด้วย' },
  { v: 'ends', label: 'ลงท้ายด้วย' },
]

export function FilterNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { headers?: string[]; count?: number; error?: string }
    | undefined

  const column = (data.config?.column as string) ?? ''
  const operator = (data.config?.operator as string) ?? '>'
  const value = (data.config?.value as string) ?? ''
  const headers = output?.headers ?? []
  const err = output?.error

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="filter" size={16} className="text-violet-400" />}>
      <div className="w-[210px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">คอลัมน์</div>
          {headers.length > 0 ? (
            <select
              value={column}
              onChange={(e) => updateNodeConfig(id, { column: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              {!headers.includes(column) && <option value={column}>{column || '— เลือก —'}</option>}
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          ) : (
            <TextInput
              value={column}
              onChange={(e) => updateNodeConfig(id, { column: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="ชื่อคอลัมน์ (รัน flow เพื่อโหลด)"
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          )}
        </div>
        <div className="flex gap-1">
          <select
            value={operator}
            onChange={(e) => updateNodeConfig(id, { operator: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-[80px] text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {OPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <TextInput
            value={value}
            onChange={(e) => updateNodeConfig(id, { value: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="ค่า"
            className="nodrag flex-1 min-w-0 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="border-t border-zinc-700/50 pt-1">
          {err ? (
            <div className="text-[10px] text-amber-400/80 italic">{err}</div>
          ) : (
            <div className="text-[10px] text-zinc-400">
              ผ่านเงื่อนไข <span className="font-mono text-emerald-300">{output?.count ?? 0}</span> แถว
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
