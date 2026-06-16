'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput, TextArea } from '@/components/ui/StableField'
import { cn } from '@/lib/utils'

interface TreeNode {
  name?: string
  kind: 'object' | 'array' | 'leaf'
  preview?: string
  label?: string          // human name for an array element (e.g. station name)
  children?: TreeNode[]
  truncated?: number
}

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

// Walk a tree following the browse segments; returns null if the path broke
// (e.g. the JSON shape changed since the user drilled in).
function nodeAt(tree: TreeNode | null, browse: string[]): TreeNode | null {
  let node: TreeNode | null = tree
  for (const seg of browse) {
    node = node?.children?.find((c) => c.name === seg) ?? null
    if (!node) return null
  }
  return node
}

export function JsonExtractNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { text?: string; value?: number; values?: unknown[]; tree?: TreeNode | null; found?: boolean }
    | undefined

  // Multiple paths → value1, value2, … (migrate the legacy single `path`)
  const rawPaths = data.config?.paths
  const paths: string[] = Array.isArray(rawPaths) && rawPaths.length
    ? (rawPaths as string[])
    : [((data.config?.path as string) ?? '')]
  const template = (data.config?.template as string) ?? ''
  const preview = output?.text ?? ''
  const tree = output?.tree ?? null
  const values = output?.values

  // Which path slot the navigator fills (UI-only)
  const [active, setActive] = useState(0)
  const activeIdx = Math.min(active, paths.length - 1)

  const writePaths = (next: string[]) =>
    updateNodeConfig(id, { paths: next, path: next[0] ?? '' })
  const setPathAt = (i: number, v: string) =>
    writePaths(paths.map((p, j) => (j === i ? v : p)))
  const addPath = () => { writePaths([...paths, '']); setActive(paths.length) }
  const removePath = (i: number) => {
    const next = paths.filter((_, j) => j !== i)
    writePaths(next.length ? next : [''])
    setActive((a) => Math.max(0, a > i ? a - 1 : a))
  }

  // Navigator state
  const [browse, setBrowse] = useState<string[]>([])
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')

  const current = nodeAt(tree, browse)
  const safeBrowse = current ? browse : []
  const level = current ?? tree

  const select = (segs: string[]) => setPathAt(activeIdx, segs.join('.'))
  const goTo = (segs: string[]) => { setBrowse(segs); setQuery('') }

  const q = query.trim().toLowerCase()
  const children = level?.children ?? []
  const visible = q
    ? children.filter((c) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.label ?? '').toLowerCase().includes(q) ||
        (c.preview ?? '').toLowerCase().includes(q)
      )
    : children
  const activePath = paths[activeIdx] ?? ''

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="json_extract" size={16} className="text-violet-400" />}>
      <div className="w-[248px] space-y-1.5">
        {/* Path slots → value1, value2, … */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">JSON path</div>
          <div className="space-y-1">
            {paths.map((p, i) => {
              const missing = output !== undefined && !!p && Array.isArray(values) && values[i] == null
              return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setActive(i) }}
                    className={cn(
                      'nodrag text-[9px] font-mono px-1 py-1 rounded shrink-0 w-[42px] text-center',
                      i === activeIdx ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    )}
                    title="คลิกเพื่อให้ตัวเลือกด้านล่างเติม path ช่องนี้"
                  >
                    value{i + 1}
                  </button>
                  <TextInput
                    type="text"
                    value={p}
                    onChange={(e) => setPathAt(i, e.target.value)}
                    onFocus={() => setActive(i)}
                    placeholder="current.temperature_2m"
                    className={cn(
                      'nodrag flex-1 min-w-0 text-xs font-mono bg-zinc-800 border rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500',
                      missing ? 'border-red-500/70' : i === activeIdx ? 'border-violet-500/60' : 'border-zinc-700'
                    )}
                  />
                  {paths.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removePath(i) }}
                      className="nodrag shrink-0 p-1 text-zinc-600 hover:text-red-400"
                      title="ลบ path นี้"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); addPath() }}
            className="nodrag mt-1 flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-300"
          >
            <Plus size={11} /> เพิ่ม path
          </button>
        </div>

        {/* Step-by-step field navigator (fills the active value slot) */}
        <div className="border border-zinc-700/60 rounded overflow-hidden">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
            className="nodrag w-full flex items-center justify-between px-1.5 py-1 bg-zinc-800/60 text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            <span>เลือกฟิลด์ทีละชั้น → <span className="text-violet-400 font-mono">value{activeIdx + 1}</span></span>
            <span className="text-zinc-600">{open ? '▾' : '▸'}</span>
          </button>

          {open && (
            <div className="nodrag">
              {/* Breadcrumb */}
              <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 text-[10px] border-b border-zinc-800/60 bg-zinc-900/40">
                <button
                  onClick={(e) => { e.stopPropagation(); goTo([]) }}
                  className={cn('hover:text-violet-300', safeBrowse.length === 0 ? 'text-violet-300' : 'text-zinc-500')}
                >
                  root
                </button>
                {safeBrowse.map((seg, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    <span className="text-zinc-700">›</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); goTo(safeBrowse.slice(0, i + 1)) }}
                      className="font-mono text-zinc-400 hover:text-violet-300"
                    >
                      {seg}
                    </button>
                  </span>
                ))}
                {safeBrowse.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); select(safeBrowse) }}
                    className="ml-auto text-[10px] text-emerald-400 hover:text-emerald-300"
                    title="ดึงทั้ง object/array นี้"
                  >
                    ใช้ระดับนี้
                  </button>
                )}
              </div>

              {/* Search — helps long arrays (e.g. 178 stations) */}
              {!!children.length && (
                <div className="px-1.5 py-1 border-b border-zinc-800/60">
                  <TextInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="ค้นหาชื่อ / ฟิลด์…"
                    className="nodrag w-full text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}

              {/* Children at the current level */}
              <div className="max-h-[150px] overflow-y-auto nowheel divide-y divide-zinc-800/60">
                {!tree ? (
                  <div className="px-1.5 py-2 text-[10px] text-zinc-600 italic">
                    รัน flow หรือเปิด Auto เพื่อดูฟิลด์ใน JSON
                  </div>
                ) : !children.length ? (
                  <div className="px-1.5 py-2 text-[10px] text-zinc-600 italic">ระดับนี้ไม่มีฟิลด์ย่อย</div>
                ) : !visible.length ? (
                  <div className="px-1.5 py-2 text-[10px] text-zinc-600 italic">ไม่พบ &quot;{query}&quot;</div>
                ) : (
                  <>
                    {visible.map((child) => {
                      const segs = [...safeBrowse, child.name as string]
                      const isContainer = child.kind !== 'leaf'
                      const fullPath = segs.join('.')
                      const right = child.label ?? (isContainer ? (child.kind === 'array' ? '[ ]' : '{ }') : child.preview)
                      return (
                        <button
                          key={child.name}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isContainer) goTo(segs)
                            else select(segs)
                          }}
                          className={cn(
                            'nodrag w-full flex items-center gap-1.5 px-1.5 py-1 text-left hover:bg-violet-500/10 transition-colors',
                            !isContainer && activePath === fullPath && 'bg-violet-500/20'
                          )}
                          title={isContainer ? `เปิด ${fullPath}${child.label ? ` — ${child.label}` : ''}` : `${fullPath} = ${child.preview}`}
                        >
                          <span className="text-[10px] w-3 text-zinc-600">{isContainer ? '▸' : '·'}</span>
                          <span className="text-[10px] font-mono text-violet-300 truncate shrink-0 max-w-[60px]">{child.name}</span>
                          <span className={cn('text-[10px] truncate flex-1 text-right', child.label ? 'text-zinc-300' : 'font-mono text-zinc-500')}>
                            {right}
                          </span>
                        </button>
                      )
                    })}
                    {!query && !!level?.truncated && (
                      <div className="px-1.5 py-1 text-[10px] text-zinc-600 italic">+{level.truncated} รายการที่เหลือ (พิมพ์ index เอง)</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Template */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">
            template <span className="text-zinc-600">(ว่าง = ไม่ส่งข้อความ)</span>
          </div>
          <TextArea
            value={template}
            onChange={(e) => updateNodeConfig(id, { template: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            rows={paths.length > 1 ? 2 : 1}
            placeholder={paths.length > 1 ? 'สถานที่ {value1}\nPM2.5 {value2}' : 'อุณหภูมิ {value1} องศา'}
            className="nodrag w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        {/* Output preview */}
        <div className="border-t border-zinc-700/50 pt-1">
          <div className="text-[10px] text-zinc-500 mb-0.5">ผลลัพธ์</div>
          <div className="text-xs font-mono text-emerald-300 bg-zinc-800/60 rounded px-1.5 py-1 min-h-[20px] break-words whitespace-pre-wrap">
            {preview || <span className="text-zinc-600 italic">—</span>}
          </div>
        </div>
      </div>
    </BaseNode>
  )
}
