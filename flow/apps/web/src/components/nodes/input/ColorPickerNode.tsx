'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function ColorPickerNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const color = (data.config?.color as string) ?? '#7c3aed'

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="color_picker" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[160px] space-y-1.5">
        {/* Big preview swatch — also acts as the color picker trigger */}
        <label
          className="relative block w-full h-16 rounded-lg border border-zinc-700 hover:border-violet-500 cursor-pointer transition-colors overflow-hidden"
          style={{ backgroundColor: color }}
          onClick={(e) => e.stopPropagation()}
          title="คลิกเพื่อเปลี่ยนสี"
        >
          <input
            type="color"
            value={color}
            onChange={(e) => updateNodeConfig(id, { color: e.target.value })}
            className="nodrag absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>

        {/* Hex text input */}
        <input
          type="text"
          value={color}
          onChange={(e) => updateNodeConfig(id, { color: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="nodrag w-full text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          placeholder="#7c3aed"
        />
      </div>
    </BaseNode>
  )
}
