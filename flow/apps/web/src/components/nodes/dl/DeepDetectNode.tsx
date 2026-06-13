'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { ModelUpload } from './ModelUpload'

interface Detection { class: string; confidence: number; bbox: number[] }

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function DeepDetectNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { count?: number; detections?: Detection[]; image?: string }
    | undefined

  const modelId = data.config?.model_id as string | undefined
  const modelName = data.config?.model_name as string | undefined

  const classCounts: Record<string, number> = {}
  for (const d of output?.detections ?? []) {
    classCounts[d.class] = (classCounts[d.class] ?? 0) + 1
  }
  const classEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1])

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="deep_detect" size={16} className="text-violet-400" />}>
      <div className="w-[210px] space-y-2">
        <ModelUpload
          modelId={modelId}
          modelName={modelName}
          task="detect"
          onChange={(v) =>
            updateNodeConfig(id, { model_id: v?.model_id ?? '', model_name: v?.model_name ?? '' })
          }
        />

        {output?.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={output.image} alt="detect" className="nodrag w-full rounded-md border border-violet-500/50" />
        )}

        {output ? (
          <div className="border-t border-zinc-700/50 pt-1.5 space-y-1">
            <div className="text-[12px] font-semibold text-emerald-400">พบ {output.count ?? 0} วัตถุ</div>
            {classEntries.map(([cls, cnt]) => (
              <div key={cls} className="flex justify-between">
                <span className="text-[11px] text-zinc-300">{cls}</span>
                <span className="text-[11px] font-medium text-violet-300 tabular-nums">{cnt}</span>
              </div>
            ))}
          </div>
        ) : (
          modelId && <div className="text-[11px] text-zinc-600 italic">ต่อภาพ แล้วกด Run</div>
        )}
      </div>
    </BaseNode>
  )
}
