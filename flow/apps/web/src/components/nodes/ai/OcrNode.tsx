'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function OcrNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; text?: string; count?: number }
    | undefined

  const text = output?.text?.trim()

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="ocr" size={16} className="text-violet-400" />}>
      <div className="w-[210px] space-y-1.5">
        {output?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="ocr"
            className="nodrag w-full rounded-md border border-violet-500/50"
          />
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-1">
            เชื่อมต่อภาพเพื่ออ่านตัวอักษร
          </div>
        )}
        {output && (
          text ? (
            <div className="nodrag max-h-24 overflow-y-auto scrollbar-themed whitespace-pre-wrap break-words rounded-md bg-zinc-800/70 border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-200 leading-snug">
              {text}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 italic">ไม่พบตัวอักษร</div>
          )
        )}
      </div>
    </BaseNode>
  )
}
