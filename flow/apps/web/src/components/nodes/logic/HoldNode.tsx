'use client'

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

export function HoldNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { on?: boolean; remaining?: number }
    | undefined

  const seconds = Number(data.config?.seconds ?? 3)
  const on = output?.on === true
  const remaining = output?.remaining ?? 0
  const progress = seconds > 0 && on ? (remaining / seconds) * 100 : 0

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="hold" size={16} className="text-violet-400" />}>
      <div className="w-[180px] space-y-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">ค้าง (วินาที)</span>
            <span className="text-[10px] font-mono text-violet-300 tabular-nums">
              {seconds.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={30}
            step={0.5}
            value={seconds}
            onChange={(e) => updateNodeConfig(id, { seconds: parseFloat(e.target.value) })}
            className="nodrag w-full h-1 accent-violet-500 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
            <div
              className={cn('h-full transition-all duration-100',
                on ? 'bg-emerald-500' : 'bg-zinc-700'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-center font-mono">
            {on ? (
              <span className="text-emerald-400">✅ ค้างอีก {remaining.toFixed(1)}s</span>
            ) : (
              <span className="text-zinc-600">OFF</span>
            )}
          </div>
        </div>
      </div>
    </BaseNode>
  )
}
