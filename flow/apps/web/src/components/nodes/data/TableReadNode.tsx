'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'ข้อความ' },
  { value: 'number', label: 'ตัวเลข' },
  { value: 'boolean', label: 'ใช่/ไม่ใช่' },
]

export function TableReadNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { headers?: string[]; text?: string; result?: boolean; error?: string }
    | undefined

  const column = (data.config?.column as string) ?? ''
  const row = (data.config?.row as string) ?? 'last'
  const rowIndex = (data.config?.rowIndex as number) ?? 0
  const type = (data.config?.type as string) ?? 'text'
  const headers = output?.headers ?? []
  const err = output?.error

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="table_read" size={16} className="text-violet-400" />}>
      <div className="w-[210px] space-y-1.5">
        {/* Column */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">คอลัมน์</div>
          {headers.length > 0 ? (
            <select
              value={column}
              onChange={(e) => updateNodeConfig(id, { column: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              {!headers.includes(column) && <option value={column}>{column || '— เลือก —'}</option>}
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          ) : (
            <TextInput
              value={column}
              onChange={(e) => updateNodeConfig(id, { column: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="ชื่อคอลัมน์ (รัน flow เพื่อโหลด)"
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          )}
        </div>

        {/* Row */}
        <div className="flex gap-1">
          <div className="flex-1">
            <div className="text-[10px] text-zinc-500 mb-0.5">แถว</div>
            <select
              value={row}
              onChange={(e) => updateNodeConfig(id, { row: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              <option value="last">ล่าสุด</option>
              <option value="first">แรกสุด</option>
              <option value="index">ระบุแถว</option>
            </select>
          </div>
          {row === 'index' && (
            <div className="w-[56px]">
              <div className="text-[10px] text-zinc-500 mb-0.5">#</div>
              <input
                type="number"
                min={0}
                value={rowIndex}
                onChange={(e) => updateNodeConfig(id, { rowIndex: Math.max(0, Number(e.target.value) || 0) })}
                onClick={(e) => e.stopPropagation()}
                className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
              />
            </div>
          )}
        </div>

        {/* Type */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">ชนิดข้อมูล</div>
          <select
            value={type}
            onChange={(e) => updateNodeConfig(id, { type: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Result */}
        <div className="border-t border-zinc-700/50 pt-1">
          <div className="text-[10px] text-zinc-500 mb-0.5">ค่าที่อ่านได้</div>
          {err ? (
            <div className="text-[10px] text-amber-400/80 italic">{err}</div>
          ) : (
            <div className={cn(
              'text-xs font-mono rounded px-1.5 py-1 break-words',
              type === 'boolean'
                ? (output?.result ? 'bg-emerald-600/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400')
                : 'bg-zinc-800/60 text-emerald-300'
            )}>
              {output?.text || <span className="text-zinc-600 italic">—</span>}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
