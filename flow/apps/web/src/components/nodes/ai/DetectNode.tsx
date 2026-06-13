'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Detection {
  class: string
  confidence: number
  bbox: number[]
}

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function DetectNode({ id, data, selected }: Props) {
  const nodeState = useExecutionStore((s) => s.nodeStates[id])
  const output = nodeState?.output as
    | { count?: number; detections?: Detection[] }
    | undefined

  const model = (data.config?.model as string) || 'yolov8n.pt'
  const confidence = (data.config?.confidence as number) ?? 0.25

  // Count occurrences of each class from detections array
  const classCounts: Record<string, number> = {}
  if (output?.detections) {
    for (const d of output.detections) {
      classCounts[d.class] = (classCounts[d.class] ?? 0) + 1
    }
  }
  const classEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1])

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="detect" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-2">
        {/* Config */}
        <div className="flex justify-between text-[11px]">
          <span className="text-zinc-500">Model</span>
          <span className="text-zinc-300">{model.replace('.pt', '')}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-zinc-500">Confidence</span>
          <span className="text-zinc-300">{confidence}</span>
        </div>

        {/* Result */}
        {output ? (
          <div className="border-t border-zinc-700/50 pt-2 space-y-1">
            {/* Total count */}
            <div className="text-[12px] font-semibold text-emerald-400">
              พบ {output.count ?? 0} วัตถุ
            </div>

            {/* Per-class breakdown */}
            {classEntries.length > 0 && (
              <div className="space-y-0.5">
                {classEntries.map(([cls, cnt]) => (
                  <div key={cls} className="flex justify-between items-center">
                    <span className="text-[11px] text-zinc-300">{cls}</span>
                    <span className="text-[11px] font-medium text-violet-300 tabular-nums">
                      {cnt}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {classEntries.length === 0 && output.count === 0 && (
              <div className="text-[11px] text-zinc-500">ไม่พบวัตถุ</div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-600 italic pt-1">
            เชื่อมต่อภาพ แล้วกด Run
          </div>
        )}
      </div>
    </BaseNode>
  )
}
