'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function StyleTransferNode({ id, data, selected }: Props) {
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; style?: string }
    | undefined

  const style = output?.style ?? (data.config?.style as string) ?? 'candy'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="style_transfer" size={16} className="text-violet-400" />}>
      <div className="w-[210px] space-y-1.5">
        {output?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="styled"
            className="nodrag w-full rounded-md border border-violet-500/50"
          />
        ) : (
          <div className="text-[11px] text-zinc-600 italic py-1">
            เชื่อมต่อภาพเพื่อแปลงสไตล์
          </div>
        )}
        <div className="text-[11px] text-zinc-400">
          สไตล์: <span className="text-violet-300 font-medium">{style}</span>
        </div>
      </div>
    </BaseNode>
  )
}
