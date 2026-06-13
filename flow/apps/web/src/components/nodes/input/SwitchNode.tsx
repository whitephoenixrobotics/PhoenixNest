'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function SwitchNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const on = data.config?.on === true

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { on: !on })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="switch" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[160px] flex flex-col items-center gap-2 py-1">
        {/* iOS-style toggle */}
        <button
          onClick={toggle}
          className={cn(
            'nodrag relative w-16 h-9 rounded-full transition-colors duration-200 shadow-inner',
            on ? 'bg-emerald-500' : 'bg-zinc-700'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-7 h-7 bg-white rounded-full shadow-md transition-all duration-200',
              on ? 'left-8' : 'left-1'
            )}
          />
        </button>

        {/* State label */}
        <span className={cn(
          'text-xs font-bold font-mono tracking-wider',
          on ? 'text-emerald-400' : 'text-zinc-500'
        )}>
          {on ? 'ON' : 'OFF'}
        </span>
      </div>
    </BaseNode>
  )
}
