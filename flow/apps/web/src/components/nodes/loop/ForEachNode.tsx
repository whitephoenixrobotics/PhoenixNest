'use client'

import { Handle, Position } from '@xyflow/react'
import { RotateCcw } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

function isScalarList(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 &&
    v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))
}

export function ForEachNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const edges = useFlowStore((s) => s.edges)
  const nodeStates = useExecutionStore((s) => s.nodeStates)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { text?: string; index?: number; total?: number; done?: boolean; result?: boolean }
    | undefined

  const field = (data.config?.field as string) ?? 'auto'
  const wrap = data.config?.wrap !== false

  // Discover list fields from whatever feeds the `list` handle
  const listFields: string[] = []
  const seen = new Set<string>()
  for (const e of edges.filter((e) => e.target === id && (e.targetHandle === 'list' || !e.targetHandle))) {
    const out = nodeStates[e.source]?.output as Record<string, unknown> | undefined
    if (!out) continue
    for (const [k, v] of Object.entries(out)) {
      if (seen.has(k) || !isScalarList(v)) continue
      seen.add(k)
      listFields.push(k)
    }
  }
  if (field !== 'auto' && !seen.has(field)) listFields.unshift(field)

  const firing = output?.result === true
  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { reset: Number(data.config?.reset ?? 0) + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="for_each" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[200px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">วนจากรายการ</div>
          <select
            value={field}
            onChange={(e) => updateNodeConfig(id, { field: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            title="เลือกฟิลด์ที่เป็นรายการ (เช่น classes จาก Detect)"
          >
            <option value="auto">อัตโนมัติ (รายการแรก)</option>
            {listFields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className={'text-center rounded py-1.5 ' + (firing ? 'bg-emerald-600/20' : 'bg-zinc-800/60')}>
          <div className="text-base font-bold text-violet-300 break-words leading-tight px-1">
            {output?.text || <span className="text-zinc-600">—</span>}
          </div>
          <div className="text-[10px] text-zinc-500">
            {output?.index ?? 0}/{output?.total ?? 0}{output?.done ? ' • จบแล้ว' : ''}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="nodrag flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={wrap}
              onChange={(e) => updateNodeConfig(id, { wrap: e.target.checked })}
              className="nodrag accent-violet-500 w-3 h-3"
            />
            วนซ้ำ (ถึงตัวสุดท้ายแล้ววนใหม่)
          </label>
        </div>
        <button
          onClick={reset}
          className="nodrag w-full flex items-center justify-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
          title="กลับไปเริ่มที่ตัวแรก"
        >
          <RotateCcw size={9} /> เริ่มใหม่
        </button>

        <div className="text-[9px] text-zinc-600 flex justify-between px-0.5">
          <span>● list (รายการ)</span>
          <span>● next (เลื่อน)</span>
        </div>
      </div>

      {/* list — the data block whose list we iterate */}
      <Handle
        id="list"
        type="target"
        position={Position.Left}
        style={{ top: '32%' }}
        title="list — บล็อกที่มีรายการ (เช่น Detect → classes)"
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-700 hover:!bg-violet-400 hover:!scale-125 transition-all"
      />
      {/* next — advance trigger (Interval / Button) */}
      <Handle
        id="next"
        type="target"
        position={Position.Left}
        style={{ top: '68%' }}
        title="next — สัญญาณเลื่อนไปตัวถัดไป (เช่น Interval / ปุ่ม)"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-700 hover:!bg-emerald-400 hover:!scale-125 transition-all"
      />
    </BaseNode>
  )
}
