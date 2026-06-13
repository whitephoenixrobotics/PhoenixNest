'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const OPS: { v: string; label: string }[] = [
  { v: 'avg', label: 'ค่าเฉลี่ย' },
  { v: 'min', label: 'ค่าต่ำสุด' },
  { v: 'max', label: 'ค่าสูงสุด' },
  { v: 'sum', label: 'ผลรวม' },
  { v: 'median', label: 'ค่ามัธยฐาน' },
  { v: 'count', label: 'นับจำนวน' },
]

export function StatisticsNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; count?: number; text?: string }
    | undefined

  const op = (data.config?.op as string) ?? 'avg'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="statistics" size={16} className="text-violet-400" />}>
      <div className="w-[180px] space-y-1.5">
        <select
          value={op}
          onChange={(e) => updateNodeConfig(id, { op: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
        >
          {OPS.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>

        <div className="text-center bg-zinc-800 rounded py-1.5">
          <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums leading-none">
            {output?.text ?? '—'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">จาก {output?.count ?? 0} ค่า</div>
        </div>
        <div className="text-[9px] text-zinc-600 text-center">ต่อหลาย input หรือบล็อกที่มีรายการตัวเลข</div>
      </div>
    </BaseNode>
  )
}
