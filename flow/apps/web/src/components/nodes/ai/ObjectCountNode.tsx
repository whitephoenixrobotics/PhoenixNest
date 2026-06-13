'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function ObjectCountNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { count?: number; class_name?: string }
    | undefined

  const configClass = (data.config?.class_name as string)?.trim()
  const label = output?.class_name || configClass || 'ทั้งหมด'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="object_count" size={16} className="text-violet-400" />}>
      <div className="w-[150px] flex flex-col items-center py-1">
        <span className="text-[11px] text-zinc-500 truncate max-w-full">นับ: {label}</span>
        <span className="text-4xl font-bold font-mono tabular-nums text-violet-300 leading-tight">
          {output?.count ?? '–'}
        </span>
        {output === undefined && (
          <span className="text-[10px] text-zinc-600 italic mt-1 text-center">
            ต่อจาก Detect แล้ว Run
          </span>
        )}
      </div>
    </BaseNode>
  )
}
