'use client'

import { useState } from 'react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextArea } from '@/components/ui/StableField'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

interface Field { name: string; base: string; suffix: string; value: string; token: string }
interface Group { block: string; fields: Field[] }

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.map(cellText).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// A value is templatable if it's a scalar or a list of scalars
function isScalarish(v: unknown): boolean {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))
  return false
}

// Internal/structural fields not worth showing in the picker
const HIDE = new Set(['image', '_block', 'detections', 'data', 'rows', 'headers', 'active_index', 'custom_text', 'displayed', 'fetched', 'sent', 'tree', 'current', 'duration_ms'])

export function JoinTextNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const nodeStates = useExecutionStore((s) => s.nodeStates)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as { text?: string } | undefined

  const template = (data.config?.template as string) ?? ''
  const [pickerOpen, setPickerOpen] = useState(true)

  // Build available fields, grouped by the source block, from the live outputs
  const groups: Group[] = []
  const nameCount: Record<string, number> = {}
  const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source)
  for (const sid of sourceIds) {
    const node = nodes.find((n) => n.id === sid)
    const out = nodeStates[sid]?.output as Record<string, unknown> | undefined
    if (!node || !out) continue
    const label = node.data?.label || node.type
    const fields: Field[] = []
    for (const [k, v] of Object.entries(out)) {
      if (HIDE.has(k) || !isScalarish(v)) continue
      nameCount[k] = (nameCount[k] ?? 0) + 1
      // Whole field (a list shows joined: "12, 1")
      fields.push({ name: k, base: k, suffix: '', value: cellText(v), token: '' })
      // List with >1 items → also offer each element on its own ({k.1}, {k.2})
      if (Array.isArray(v) && v.length > 1) {
        v.forEach((el, i) => {
          fields.push({ name: `${k} [${i + 1}]`, base: k, suffix: `.${i + 1}`, value: cellText(el), token: '' })
        })
      }
    }
    if (fields.length) groups.push({ block: label, fields })
  }
  // Decide short {field} vs qualified {Block.field} per field (clash → qualified)
  for (const g of groups) {
    for (const f of g.fields) {
      const prefix = nameCount[f.base] > 1 ? `${g.block}.` : ''
      f.token = `{${prefix}${f.base}${f.suffix}}`
    }
  }

  const insert = (token: string) =>
    updateNodeConfig(id, { template: template ? `${template} ${token}` : token })

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="join_text" size={16} className="text-violet-400" />}>
      <div className="w-[244px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">
            template <span className="text-zinc-600">(ว่าง = ต่อทุก input)</span>
          </div>
          <TextArea
            value={template}
            onChange={(e) => updateNodeConfig(id, { template: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            placeholder={'พบ {count} คน'}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        {/* Field picker — click to insert; grouped by source block, live values */}
        <div className="border border-zinc-700/60 rounded overflow-hidden">
          <button
            onClick={(e) => { e.stopPropagation(); setPickerOpen((o) => !o) }}
            className="nodrag w-full flex items-center justify-between px-1.5 py-1 bg-zinc-800/60 text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            <span>ฟิลด์ที่ใช้ได้ (คลิกเพื่อใส่)</span>
            <span className="text-zinc-600">{pickerOpen ? '▾' : '▸'}</span>
          </button>
          {pickerOpen && (
            <div className="max-h-[150px] overflow-y-auto nowheel nodrag">
              {groups.length === 0 ? (
                <div className="px-1.5 py-2 text-[10px] text-zinc-600 italic">
                  ต่อบล็อกเข้ามา + รัน/เปิด Auto เพื่อดูฟิลด์
                </div>
              ) : (
                groups.map((g, gi) => (
                  <div key={gi}>
                    <div className="px-1.5 py-0.5 text-[9px] text-zinc-500 bg-zinc-900/60 sticky top-0">{g.block}</div>
                    {g.fields.map((f) => (
                      <button
                        key={f.name}
                        onClick={(e) => { e.stopPropagation(); insert(f.token) }}
                        title={`ใส่ ${f.token}`}
                        className="nodrag w-full flex items-center gap-1.5 px-1.5 py-1 text-left hover:bg-violet-500/10"
                      >
                        <span className="text-[10px] font-mono text-violet-300 truncate shrink-0 max-w-[110px]">{f.token}</span>
                        <span className="text-[10px] text-zinc-500 truncate flex-1 text-right">{f.value}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-700/50 pt-1">
          <div className="text-[10px] text-zinc-500 mb-0.5">ผลลัพธ์</div>
          <div className="text-xs font-mono bg-zinc-800/60 text-emerald-300 rounded px-1.5 py-1 break-words whitespace-pre-wrap min-h-[22px]">
            {output?.text || <span className="text-zinc-600 italic">—</span>}
          </div>
        </div>
      </div>
    </BaseNode>
  )
}
