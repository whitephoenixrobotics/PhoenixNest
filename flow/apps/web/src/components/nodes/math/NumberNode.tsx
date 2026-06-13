'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function NumberNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const value = String(data.config?.value ?? '0')

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="number" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[140px]">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            // Allow digits, one optional minus sign, one optional dot
            const v = e.target.value
            if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
              updateNodeConfig(id, { value: v })
            }
          }}
          placeholder="0"
          className="nodrag w-full text-center text-2xl font-bold font-mono bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-violet-300 focus:outline-none focus:border-violet-500 tabular-nums"
        />
      </div>
    </BaseNode>
  )
}
