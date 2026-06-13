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

export function ClampNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; input?: number; clamped?: boolean; text?: string }
    | undefined

  const lo = (data.config?.min as number) ?? 0
  const hi = (data.config?.max as number) ?? 100
  const clamped = output?.clamped === true

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="clamp" size={16} className="text-violet-400" />}>
      <div className="w-[180px] space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 w-7 shrink-0">ต่ำ</span>
          <input
            type="number"
            value={lo}
            onChange={(e) => updateNodeConfig(id, { min: Number(e.target.value) || 0 })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 w-7 shrink-0">สูง</span>
          <input
            type="number"
            value={hi}
            onChange={(e) => updateNodeConfig(id, { max: Number(e.target.value) || 0 })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex items-center justify-center gap-2 bg-zinc-800 rounded py-1.5 px-2">
          <span className="text-xs font-mono text-zinc-400 tabular-nums">{output?.input ?? '?'}</span>
          <span className="text-zinc-500">→</span>
          <span className={'text-sm font-bold font-mono tabular-nums ' + (clamped ? 'text-amber-400' : 'text-emerald-400')}>
            {output?.text ?? '—'}
          </span>
        </div>
      </div>
    </BaseNode>
  )
}
