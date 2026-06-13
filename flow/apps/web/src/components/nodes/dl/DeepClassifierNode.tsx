'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { ModelUpload } from './ModelUpload'

interface TopK { label: string; confidence: number }

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function DeepClassifierNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { label?: string; confidence?: number; top5?: TopK[] }
    | undefined

  const modelId = data.config?.model_id as string | undefined
  const modelName = data.config?.model_name as string | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="deep_classifier" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-2">
        <ModelUpload
          modelId={modelId}
          modelName={modelName}
          task="classify"
          onChange={(v) =>
            updateNodeConfig(id, { model_id: v?.model_id ?? '', model_name: v?.model_name ?? '' })
          }
        />

        {output?.label ? (
          <div className="border-t border-zinc-700/50 pt-1.5 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-emerald-400 truncate">{output.label}</span>
              {output.confidence !== undefined && (
                <span className="text-[10px] font-mono text-zinc-500">
                  {Math.round(output.confidence * 100)}%
                </span>
              )}
            </div>
            {output.top5?.slice(1, 4).map((t) => (
              <div key={t.label} className="flex justify-between text-[10px] text-zinc-500">
                <span className="truncate">{t.label}</span>
                <span className="font-mono tabular-nums">{Math.round(t.confidence * 100)}%</span>
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
