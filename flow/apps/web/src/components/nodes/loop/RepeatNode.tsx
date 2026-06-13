'use client'

import { RotateCcw } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function RepeatNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { count?: number; total?: number; done?: boolean; result?: boolean; text?: string }
    | undefined

  const times = (data.config?.times as number) ?? 3
  const firing = output?.result === true
  const done = output?.done === true

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { reset: Number(data.config?.reset ?? 0) + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="repeat" size={16} className="text-violet-400" />}>
      <div className="w-[180px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">ทำซ้ำกี่ครั้ง</div>
          <input
            type="number"
            min={1}
            value={times}
            onChange={(e) => updateNodeConfig(id, { times: Math.max(1, Number(e.target.value) || 1) })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className={
          'text-center text-sm font-mono font-bold rounded py-1.5 ' +
          (done ? 'bg-emerald-600/20 text-emerald-300'
            : firing ? 'bg-violet-600/20 text-violet-200'
            : 'bg-zinc-800 text-zinc-400')
        }>
          {output?.text ?? `0/${times}`}
        </div>

        <button
          onClick={reset}
          className="nodrag w-full flex items-center justify-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
          title="เริ่มนับใหม่"
        >
          <RotateCcw size={9} /> เริ่มใหม่
        </button>
      </div>
    </BaseNode>
  )
}
