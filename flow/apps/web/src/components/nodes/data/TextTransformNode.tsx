'use client'

import { Plus, X, ArrowRight } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'

interface Rule { from?: string; to?: string }

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

// Internal/structural fields not worth offering as a source
const HIDE = new Set(['image', '_block', 'detections', 'data', 'rows', 'headers', 'values', 'tree', 'matched', 'result', 'on'])

function isScalarish(v: unknown): boolean {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))
  return false
}

export function TextTransformNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const edges = useFlowStore((s) => s.edges)
  const nodeStates = useExecutionStore((s) => s.nodeStates)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { text?: string; matched?: boolean }
    | undefined

  const rules: Rule[] = Array.isArray(data.config?.rules) && (data.config!.rules as Rule[]).length
    ? (data.config!.rules as Rule[])
    : [{ from: '', to: '' }]
  const source = (data.config?.source as string) ?? 'auto'

  // Discover field names from the blocks connected to this node's input
  const fieldNames: string[] = []
  const seen = new Set<string>()
  for (const e of edges.filter((e) => e.target === id)) {
    const out = nodeStates[e.source]?.output as Record<string, unknown> | undefined
    if (!out) continue
    for (const [k, v] of Object.entries(out)) {
      if (HIDE.has(k) || seen.has(k) || !isScalarish(v)) continue
      seen.add(k)
      fieldNames.push(k)
    }
  }
  // Keep a chosen field visible even if the upstream hasn't run yet
  if (source !== 'auto' && !seen.has(source)) fieldNames.unshift(source)

  const match = (data.config?.match as string) ?? 'exact'
  const fallback = (data.config?.fallback as string) ?? 'keep'
  const def = (data.config?.default as string) ?? ''

  const setRules = (next: Rule[]) => updateNodeConfig(id, { rules: next })
  const setRule = (i: number, patch: Partial<Rule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRule = () => setRules([...rules, { from: '', to: '' }])
  const removeRule = (i: number) => setRules(rules.length > 1 ? rules.filter((_, j) => j !== i) : [{ from: '', to: '' }])

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="text_transform" size={16} className="text-violet-400" />}>
      <div className="w-[244px] space-y-1.5">
        {/* Source: whole text, or a specific field like `class` */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">อ่านจาก</div>
          <select
            value={source}
            onChange={(e) => updateNodeConfig(id, { source: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag w-full text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
            title="เช็คจากข้อความทั้งก้อน หรือเจาะเฉพาะฟิลด์ (เช่น class)"
          >
            <option value="auto">ข้อความทั้งหมด (อัตโนมัติ)</option>
            {fieldNames.map((f) => (
              <option key={f} value={f}>เฉพาะฟิลด์: {f}</option>
            ))}
          </select>
          {source === 'auto' && fieldNames.length === 0 && (
            <div className="text-[9px] text-zinc-600 mt-0.5">ต่อบล็อก + เปิด Auto/รัน เพื่อเลือกฟิลด์</div>
          )}
        </div>

        <div className="text-[10px] text-zinc-500">คำที่จะแปลง (ถ้าตรง → เปลี่ยนเป็น)</div>
        <div className="space-y-1">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <TextInput
                value={r.from ?? ''}
                onChange={(e) => setRule(i, { from: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="จาก"
                className="nodrag flex-1 min-w-0 text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
              <ArrowRight size={11} className="text-zinc-600 shrink-0" />
              <TextInput
                value={r.to ?? ''}
                onChange={(e) => setRule(i, { to: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="เป็น"
                className="nodrag flex-1 min-w-0 text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-emerald-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
              <button onClick={(e) => { e.stopPropagation(); removeRule(i) }} className="nodrag shrink-0 p-1 text-zinc-600 hover:text-red-400">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={(e) => { e.stopPropagation(); addRule() }} className="nodrag flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-300">
          <Plus size={11} /> เพิ่มคำ
        </button>

        <div className="flex gap-1">
          <select
            value={match}
            onChange={(e) => updateNodeConfig(id, { match: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
            title="วิธีเทียบข้อความเข้ากับ 'จาก'"
          >
            <option value="exact">ตรงทั้งหมด</option>
            <option value="contains">มีคำว่า</option>
          </select>
          <select
            value={fallback}
            onChange={(e) => updateNodeConfig(id, { fallback: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
            title="ถ้าไม่ตรงกฎไหนเลย"
          >
            <option value="keep">ไม่ตรง = คงเดิม</option>
            <option value="blank">ไม่ตรง = ว่าง</option>
            <option value="custom">ไม่ตรง = กำหนดเอง</option>
          </select>
        </div>
        {fallback === 'custom' && (
          <TextInput
            value={def}
            onChange={(e) => updateNodeConfig(id, { default: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="ข้อความเมื่อไม่ตรง"
            className="nodrag w-full text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        )}

        <div className="border-t border-zinc-700/50 pt-1">
          <div className="text-[10px] text-zinc-500 mb-0.5">ผลลัพธ์</div>
          <div className="text-xs font-mono bg-zinc-800/60 text-emerald-300 rounded px-1.5 py-1 break-words min-h-[22px]">
            {output?.text || <span className="text-zinc-600 italic">—</span>}
          </div>
        </div>
      </div>
    </BaseNode>
  )
}
