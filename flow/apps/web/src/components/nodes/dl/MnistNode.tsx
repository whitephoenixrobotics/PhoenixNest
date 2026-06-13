'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function MnistNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { digit?: number; confidence?: number }
    | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="mnist" size={16} className="text-violet-400" />}>
      <div className="w-[150px] flex flex-col items-center py-1">
        {output?.digit !== undefined ? (
          <>
            <span className="text-5xl font-bold font-mono tabular-nums text-violet-300 leading-tight">
              {output.digit}
            </span>
            {output.confidence !== undefined && (
              <span className="text-[10px] font-mono text-zinc-500 mt-0.5">
                มั่นใจ {Math.round(output.confidence * 100)}%
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-zinc-600 italic py-3 text-center">
            ต่อภาพตัวเลข แล้ว Run
          </span>
        )}
      </div>
    </BaseNode>
  )
}
