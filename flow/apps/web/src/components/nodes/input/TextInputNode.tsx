'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { TextArea } from '@/components/ui/StableField'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function TextInputNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const text = (data.config?.text as string) ?? ''

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="text_input" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[220px] space-y-1">
        <TextArea
          value={text}
          onChange={(e) => updateNodeConfig(id, { text: e.target.value })}
          placeholder="พิมพ์ข้อความที่นี่..."
          rows={3}
          className="nodrag w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
        />
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>{text.length} ตัวอักษร</span>
        </div>
      </div>
    </BaseNode>
  )
}
