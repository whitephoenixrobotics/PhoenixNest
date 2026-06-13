'use client'

import { RotateCcw } from 'lucide-react'
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

export function ToggleNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { on?: boolean }
    | undefined

  const on = output?.on === true

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cur = Number(data.config?.reset ?? 0)
    updateNodeConfig(id, { reset: cur + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="toggle" size={16} className="text-violet-400" />}>
      <div className="w-[140px] flex flex-col items-center gap-2 py-1">
        <div className={cn(
          'relative w-14 h-8 rounded-full transition-colors',
          on ? 'bg-emerald-500' : 'bg-zinc-700'
        )}>
          <span className={cn(
            'absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all',
            on ? 'left-7' : 'left-1'
          )} />
        </div>
        <span className={cn(
          'text-xs font-bold font-mono',
          on ? 'text-emerald-400' : 'text-zinc-500'
        )}>
          {on ? 'ON' : 'OFF'}
        </span>
        <button
          onClick={reset}
          className="nodrag flex items-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
        >
          <RotateCcw size={9} /> Reset
        </button>
      </div>
    </BaseNode>
  )
}
