'use client'

import { BaseNode } from '../../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function SmileNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { is_smiling?: boolean; score?: number }
    | undefined

  const smiling = output?.is_smiling
  const hasResult = output?.score !== undefined && output.score > 0
  const showFace = !hasResult ? '🙂' : smiling ? '😊' : '😐'
  const showLabel = !hasResult ? '—' : smiling ? 'ยิ้ม' : 'ไม่ยิ้ม'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="smile" size={16} className="text-violet-400" />}>
      <div className="w-[160px] flex flex-col items-center justify-center py-2">
        <span className="text-3xl">{showFace}</span>
        <span
          className={
            'text-sm font-medium mt-1 ' +
            (smiling && hasResult ? 'text-emerald-400' : 'text-zinc-400')
          }
        >
          {showLabel}
        </span>
        {hasResult && (
          <span className="text-[10px] text-zinc-500 mt-0.5 font-mono">
            ยิ้ม {Math.round((output?.score ?? 0) * 100)}%
          </span>
        )}
      </div>
    </BaseNode>
  )
}
