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
  { value: 'avg', label: 'ค่าเฉลี่ย' },
  { value: 'min', label: 'ค่าต่ำสุด' },
  { value: 'max', label: 'ค่าสูงสุด' },
  { value: 'sum', label: 'ผลรวม' },
  { value: 'count', label: 'จำนวน' },
  { value: 'last', label: 'ค่าล่าสุด' },
]

export function AggregateNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { headers?: string[]; text?: string; error?: string }
    | undefined

  const op = (data.config?.op as string) ?? 'avg'
  const column = (data.config?.column as string) ?? ''
  const headers = output?.headers ?? []
  const err = output?.error

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="aggregate" size={16} className="text-violet-400" />}>
      <div className="w-[190px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">วิธีสรุป</div>
          <select
            value={op}
            onChange={(e) => updateNodeConfig(id, { op: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
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
        <div className="border-t border-zinc-700/50 pt-1">
          <div className="text-[10px] text-zinc-500 mb-0.5">ผลลัพธ์</div>
          {err ? (
            <div className="text-[10px] text-amber-400/80 italic">{err}</div>
          ) : (
            <div className="text-xs font-mono bg-zinc-800/60 text-emerald-300 rounded px-1.5 py-1 break-words">
              {output?.text || <span className="text-zinc-600 italic">—</span>}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
