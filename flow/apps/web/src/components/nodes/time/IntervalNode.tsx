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

const UNITS: { value: string; label: string }[] = [
  { value: 's', label: 'วินาที' },
  { value: 'm', label: 'นาที' },
  { value: 'h', label: 'ชั่วโมง' },
]

export function IntervalNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { result?: boolean; text?: string }
    | undefined

  const every = (data.config?.every as number) ?? 5
  const unit = (data.config?.unit as string) ?? 'm'
  const firing = output?.result === true
  const status = output?.text ?? 'เปิด Auto (∞) เพื่อเริ่มจับเวลา'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="interval" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[180px] space-y-2">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">ยิง True ทุกๆ</div>
          <div className="flex gap-1">
            <input
              type="number"
              min={1}
              value={every}
              onChange={(e) => updateNodeConfig(id, { every: Math.max(1, Number(e.target.value) || 1) })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag w-[60px] text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            />
            <select
              value={unit}
              onChange={(e) => updateNodeConfig(id, { unit: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={
          'text-center text-xs font-mono rounded py-1.5 ' +
          (firing ? 'bg-emerald-600/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400')
        }>
          {status}
        </div>
      </div>
    </BaseNode>
  )
}
