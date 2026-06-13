'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function PoseNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; count?: number; gestures?: string[] }
    | undefined

  const gestures = output?.gestures ?? []

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="pose" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-1.5">
        {output?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="pose"
            className="nodrag w-full rounded-md border border-violet-500/50"
          />
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-1">
            เชื่อมต่อภาพเพื่อตรวจท่าทาง
          </div>
        )}
        {output?.count !== undefined && (
          <div className="text-[11px] font-medium text-violet-400">
            พบ {output.count} คน
          </div>
        )}
        {gestures.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {gestures.map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-medium"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
    </BaseNode>
  )
}
