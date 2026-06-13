'use client'

import { RotateCcw, Zap } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function TriggerOnceNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { fired?: boolean }
    | undefined

  const fired = output?.fired === true

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cur = Number(data.config?.reset ?? 0)
    updateNodeConfig(id, { reset: cur + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="trigger_once" size={16} className="text-violet-400" />}>
      <div className="w-[150px] flex flex-col items-center gap-1.5 py-1">
        <Zap
          size={28}
          className={cn(
            fired ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'
          )}
        />
        <span className={cn(
          'text-xs font-bold',
          fired ? 'text-yellow-400' : 'text-zinc-500'
        )}>
          {fired ? '🔥 ยิงแล้ว' : '⏸ รอ'}
        </span>
        <button
          onClick={reset}
          className="nodrag flex items-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
          title="รีเซ็ตเพื่อยิงใหม่ได้"
        >
          <RotateCcw size={9} /> Reset
        </button>
      </div>
    </BaseNode>
  )
}
