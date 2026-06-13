'use client'

import { BaseNode } from '../../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function FaceCountNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { count?: number }
    | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="face_count" size={16} className="text-violet-400" />}>
      <div className="w-[150px] flex items-center justify-center py-2">
        <span className="text-3xl font-bold text-violet-300 tabular-nums">
          {output?.count ?? '—'}
        </span>
      </div>
    </BaseNode>
  )
}
