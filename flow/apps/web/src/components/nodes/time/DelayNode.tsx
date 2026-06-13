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

export function DelayNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { result?: boolean; elapsed?: number; remaining?: number }
    | undefined

  const seconds = Number(data.config?.seconds ?? 2)
  const ready = output?.result === true
  const elapsed = output?.elapsed ?? 0
  const remaining = output?.remaining ?? seconds
  const progress = seconds > 0 ? Math.min(100, (elapsed / seconds) * 100) : 0

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="delay" size={16} className="text-violet-400" />}>
      <div className="w-[180px] space-y-2">
        {/* Seconds input + slider */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">หน่วง (วินาที)</span>
            <span className="text-[10px] font-mono text-violet-300 tabular-nums">
              {seconds.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={0.5}
            value={seconds}
            onChange={(e) => updateNodeConfig(id, { seconds: parseFloat(e.target.value) })}
            className="nodrag w-full h-1 accent-violet-500 cursor-pointer"
          />
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-100',
                ready ? 'bg-emerald-500' : 'bg-violet-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-zinc-500 text-center font-mono">
            {ready ? (
              <span className="text-emerald-400 font-semibold">✅ พร้อม</span>
            ) : output ? (
              <span>⏳ เหลือ {remaining.toFixed(1)}s</span>
            ) : (
              <span className="text-zinc-600">รอ input</span>
            )}
          </div>
        </div>
      </div>
    </BaseNode>
  )
}
