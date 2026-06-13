'use client'

import { BaseNode } from '../../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function EmotionNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; emotion?: string | null; emoji?: string; confidence?: number; count?: number }
    | undefined

  const hasFace = !!output?.emotion

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="emotion" size={16} className="text-violet-400" />}>
      <div className="w-[200px] space-y-1.5">
        {output?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="emotion"
            className="nodrag w-full rounded-md border border-violet-500/50"
          />
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-1">
            เชื่อมต่อภาพเพื่อตรวจอารมณ์
          </div>
        )}
        {output && (
          <div className="flex items-center justify-center gap-2 pt-0.5">
            {hasFace ? (
              <>
                <span className="text-2xl leading-none">{output.emoji}</span>
                <span className="text-sm font-medium text-zinc-100">{output.emotion}</span>
                {output.confidence !== undefined && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    {Math.round(output.confidence * 100)}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-zinc-500 italic">ไม่พบใบหน้า</span>
            )}
          </div>
        )}
      </div>
    </BaseNode>
  )
}
