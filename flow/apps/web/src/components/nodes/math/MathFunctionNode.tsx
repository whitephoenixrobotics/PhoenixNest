'use client'

import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const FUNCS: { v: string; label: string }[] = [
  { v: 'sqrt', label: '√x  รากที่สอง' },
  { v: 'sq', label: 'x²  ยกกำลังสอง' },
  { v: 'pow', label: 'xⁿ  ยกกำลัง n' },
  { v: 'abs', label: '|x|  ค่าสัมบูรณ์' },
  { v: 'round', label: 'ปัดเศษ (ใกล้สุด)' },
  { v: 'floor', label: 'ปัดลง' },
  { v: 'ceil', label: 'ปัดขึ้น' },
  { v: 'sin', label: 'sin' },
  { v: 'cos', label: 'cos' },
  { v: 'tan', label: 'tan' },
  { v: 'log10', label: 'log₁₀' },
  { v: 'ln', label: 'ln  (ฐาน e)' },
  { v: 'exp', label: 'eˣ' },
  { v: 'inv', label: '1/x  ส่วนกลับ' },
  { v: 'neg', label: '−x  กลับเครื่องหมาย' },
]

const TRIG = new Set(['sin', 'cos', 'tan'])

export function MathFunctionNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; input?: number; text?: string }
    | undefined

  const func = (data.config?.func as string) ?? 'sqrt'
  const n = (data.config?.n as number) ?? 2
  const deg = data.config?.deg !== false

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="math_function" size={16} className="text-violet-400" />}>
      <div className="w-[190px] space-y-1.5">
        <select
          value={func}
          onChange={(e) => updateNodeConfig(id, { func: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-violet-200 focus:outline-none focus:border-violet-500"
        >
          {FUNCS.map((f) => (
            <option key={f.v} value={f.v}>{f.label}</option>
          ))}
        </select>

        {func === 'pow' && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 shrink-0">n =</span>
            <input
              type="number"
              value={n}
              onChange={(e) => updateNodeConfig(id, { n: Number(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
              className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            />
          </div>
        )}

        {TRIG.has(func) && (
          <label className="nodrag flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={deg}
              onChange={(e) => updateNodeConfig(id, { deg: e.target.checked })}
              className="nodrag accent-violet-500 w-3 h-3"
            />
            องศา (ปิด = เรเดียน)
          </label>
        )}

        <div className="flex items-center justify-center gap-2 bg-zinc-800 rounded py-1.5 px-2">
          <span className="text-xs font-mono text-zinc-400 tabular-nums">{output?.input ?? '?'}</span>
          <span className="text-zinc-500">→</span>
          <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">{output?.text ?? '—'}</span>
        </div>
      </div>
    </BaseNode>
  )
}
