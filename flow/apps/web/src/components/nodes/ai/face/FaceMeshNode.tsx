'use client'

import { BaseNode } from '../../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function FaceMeshNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; count?: number }
    | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="face_mesh" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-1.5">
        {output?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="face mesh"
            className="nodrag w-full rounded-md border border-violet-500/50"
          />
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-1">
            เชื่อมต่อภาพเพื่อตรวจหาใบหน้า
          </div>
        )}
        {output?.count !== undefined && (
          <div className="text-[11px] font-medium text-violet-400">
            พบ {output.count} ใบหน้า
          </div>
        )}
      </div>
    </BaseNode>
  )
}
