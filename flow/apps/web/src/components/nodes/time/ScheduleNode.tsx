'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const DAYS = [
  { idx: 0, label: 'จ' },
  { idx: 1, label: 'อ' },
  { idx: 2, label: 'พ' },
  { idx: 3, label: 'พฤ' },
  { idx: 4, label: 'ศ' },
  { idx: 5, label: 'ส' },
  { idx: 6, label: 'อา' },
]

export function ScheduleNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { result?: boolean; now?: string; text?: string }
    | undefined

  const datetime = (data.config?.datetime as string) ?? ''
  const mode = (data.config?.mode as string) ?? 'once'
  const days = (data.config?.days as number[]) ?? []
  const active = output?.result === true

  const toggleDay = (e: React.MouseEvent, day: number) => {
    e.stopPropagation()
    const newDays = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b)
    updateNodeConfig(id, { days: newDays })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="schedule" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[220px] space-y-2">
        {/* Mode toggle */}
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); updateNodeConfig(id, { mode: 'once' }) }}
            className={cn(
              'nodrag flex-1 px-2 py-1 text-[10px] rounded transition-colors',
              mode === 'once'
                ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
            )}
          >
            ครั้งเดียว
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updateNodeConfig(id, { mode: 'daily' }) }}
            className={cn(
              'nodrag flex-1 px-2 py-1 text-[10px] rounded transition-colors',
              mode === 'daily'
                ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
            )}
          >
            รายวัน
          </button>
        </div>

        {/* Datetime picker — daily mode only needs time */}
        <input
          type={mode === 'daily' ? 'time' : 'datetime-local'}
          value={
            mode === 'daily'
              ? (datetime.includes('T') ? datetime.split('T')[1].slice(0, 5) : datetime)
              : datetime
          }
          onChange={(e) => {
            const v = e.target.value
            // For daily mode store as "1970-01-01THH:MM" so backend can parse via fromisoformat
            const stored = mode === 'daily' ? `1970-01-01T${v}` : v
            updateNodeConfig(id, { datetime: stored })
          }}
          className="nodrag w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
        />

        {/* Day picker — daily mode only */}
        {mode === 'daily' && (
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">
              วัน {days.length === 0 && '(ทุกวัน)'}
            </div>
            <div className="flex gap-0.5">
              {DAYS.map(({ idx, label }) => {
                const on = days.includes(idx)
                return (
                  <button
                    key={idx}
                    onClick={(e) => toggleDay(e, idx)}
                    className={cn(
                      'nodrag flex-1 text-[10px] py-1 rounded transition-colors font-medium',
                      on
                        ? 'bg-violet-500 text-white'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Status */}
        <div className={cn(
          'text-[11px] text-center rounded py-1',
          active
            ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
            : 'text-zinc-500'
        )}>
          {output?.text ?? '—'}
        </div>

        {output?.now && (
          <div className="text-[10px] text-zinc-600 text-center font-mono">
            now {output.now}
          </div>
        )}
      </div>
    </BaseNode>
  )
}
