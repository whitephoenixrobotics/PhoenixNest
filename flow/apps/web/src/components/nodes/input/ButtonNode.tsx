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

export function ButtonNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const pressed = data.config?.pressed === true

  const press   = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); updateNodeConfig(id, { pressed: true })
  }
  const release = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); updateNodeConfig(id, { pressed: false })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="button" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-full min-w-[140px] flex items-center justify-center py-3">
        {/* Outer ring (the "socket" / bezel) */}
        <div
          className={cn(
            'rounded-full p-1.5 transition-colors duration-150',
            pressed
              ? 'bg-gradient-to-br from-emerald-700 to-emerald-900'
              : 'bg-gradient-to-br from-zinc-700 to-zinc-900'
          )}
          style={{ width: 88, height: 88 }}
        >
          {/* Inner button */}
          <button
            onMouseDown={press}
            onMouseUp={release}
            onMouseLeave={release}
            onTouchStart={press}
            onTouchEnd={release}
            className={cn(
              'nodrag select-none w-full h-full rounded-full font-bold text-sm flex items-center justify-center transition-all duration-100',
              pressed
                ? // PRESSED: depressed inward, glowing
                  'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white scale-95'
                : // IDLE: raised, 3D
                  'bg-gradient-to-br from-zinc-500 to-zinc-700 hover:from-zinc-400 hover:to-zinc-600 text-zinc-100 active:scale-95'
            )}
            style={{
              boxShadow: pressed
                ? 'inset 0 3px 6px rgba(0,0,0,.45), 0 0 18px 4px rgba(16,185,129,.55)'
                : 'inset 0 1px 0 rgba(255,255,255,.15), 0 4px 8px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.05)',
            }}
          >
            <span
              style={{
                textShadow: pressed
                  ? '0 1px 1px rgba(0,0,0,.3)'
                  : '0 -1px 0 rgba(0,0,0,.4)',
              }}
            >
              {pressed ? 'กด' : 'ปล่อย'}
            </span>
          </button>
        </div>
      </div>
    </BaseNode>
  )
}
