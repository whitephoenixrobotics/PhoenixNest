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

export function WhileNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { count?: number; done?: boolean; result?: boolean; text?: string }
    | undefined

  const running = output?.result === true
  const done = output?.done === true

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { reset: Number(data.config?.reset ?? 0) + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="while" size={16} className="text-violet-400" />}>
      <div className="w-[170px] space-y-1.5">
        <div className="text-[10px] text-zinc-500">วน True ขณะเงื่อนไขจริง</div>
        <div className={
          'text-center text-sm font-mono rounded py-2 ' +
          (running ? 'bg-emerald-600/20 text-emerald-300'
            : done ? 'bg-violet-600/20 text-violet-200'
            : 'bg-zinc-800 text-zinc-400')
        }>
          {output?.text ?? '⏸ รอเงื่อนไข'}
        </div>
        <button
          onClick={reset}
          className="nodrag w-full flex items-center justify-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
          title="รีเซ็ตตัวนับรอบ"
        >
          <RotateCcw size={9} /> รีเซ็ต
        </button>
      </div>
    </BaseNode>
  )
}
