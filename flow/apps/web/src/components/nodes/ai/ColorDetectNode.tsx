'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function ColorDetectNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { hex?: string; name?: string }
    | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="color_detect" size={16} className="text-violet-400" />}>
      <div className="w-[160px] flex flex-col items-center py-1 gap-1.5">
        {output?.hex ? (
          <>
            <div
              className="nodrag w-full h-14 rounded-lg border border-zinc-600 shadow-inner"
              style={{ backgroundColor: output.hex }}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100">{output.name}</span>
              <span className="text-[11px] font-mono text-zinc-400">{output.hex}</span>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-2 text-center">
            เชื่อมต่อภาพเพื่อหาสีเด่น
          </div>
        )}
      </div>
    </BaseNode>
  )
}
