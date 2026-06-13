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

export function MapRangeNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; input?: number; text?: string }
    | undefined

  const inMin = (data.config?.in_min as number) ?? 0
  const inMax = (data.config?.in_max as number) ?? 100
  const outMin = (data.config?.out_min as number) ?? 0
  const outMax = (data.config?.out_max as number) ?? 1
  const clamp = data.config?.clamp !== false

  const numField = (key: string, value: number) => (
    <input
      type="number"
      value={value}
      onChange={(e) => updateNodeConfig(id, { [key]: Number(e.target.value) || 0 })}
      onClick={(e) => e.stopPropagation()}
      className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
    />
  )

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="map_range" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">จากช่วง</div>
          <div className="flex items-center gap-1">
            {numField('in_min', inMin)}
            <span className="text-zinc-600 text-xs">–</span>
            {numField('in_max', inMax)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">เป็นช่วง</div>
          <div className="flex items-center gap-1">
            {numField('out_min', outMin)}
            <span className="text-zinc-600 text-xs">–</span>
            {numField('out_max', outMax)}
          </div>
        </div>

        <label className="nodrag flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={clamp}
            onChange={(e) => updateNodeConfig(id, { clamp: e.target.checked })}
            className="nodrag accent-violet-500 w-3 h-3"
          />
          จำกัดไม่ให้เกินช่วง
        </label>

        <div className="flex items-center justify-center gap-2 bg-zinc-800 rounded py-1.5 px-2">
          <span className="text-xs font-mono text-zinc-400 tabular-nums">{output?.input ?? '?'}</span>
          <span className="text-zinc-500">→</span>
          <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">{output?.text ?? '—'}</span>
        </div>
      </div>
    </BaseNode>
  )
}
