'use client'

import { Handle, Position } from '@xyflow/react'
import { Plus, X } from 'lucide-react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { TextInput } from '@/components/ui/StableField'
import type { NodeStatus } from '@/types'

interface Branch {
  condition: string
  value?: string
  output_text?: string
  // Which incoming slot this branch tests: value1 / value2 / text1 / count1 /
  // detect. Empty = merged/auto (legacy, or before the flow has run).
  source?: string
  // Extra conditions joined to this branch. 'and'/'or' combine conditions
  // logically; a comparator (=, !=, >, <, >=, <=; legacy 'not' = ≠) compares
  // the previous term's value with this term's. Each term targets its own slot.
  terms?: { op?: 'and' | 'or' | 'not' | '=' | '!=' | '>' | '<' | '>=' | '<='; source?: string; condition: string; value?: string }[]
}

type TermLike = { source?: string; condition: string; value?: string }

const CONDITIONS = [
  { key: 'value',        label: 'value' },
  { key: 'text',         label: 'text' },
  { key: 'count',        label: 'count' },
  { key: 'class',        label: 'class =' },
  { key: 'any_detected', label: 'any detect' },
]

// Short type tag shown after each incoming value, e.g. "10(value)", "FFF(text)".
const TYPE_LABEL: Record<string, string> = {
  number: 'value',
  text:   'text',
  count:  'count',
  detect: 'detect',
  bool:   'bool',
}

// Join operators between condition terms: AND/OR combine logically; the rest
// compare the previous term's value with this term's (value1 > value2, etc.).
const OP_OPTIONS: { v: string; label: string }[] = [
  { v: 'and', label: 'AND' },
  { v: 'or',  label: 'OR' },
  { v: '=',   label: '=' },
  { v: '!=',  label: '≠' },
  { v: '>',   label: '>' },
  { v: '<',   label: '<' },
  { v: '>=',  label: '≥' },
  { v: '<=',  label: '≤' },
]
const isCmpOp = (op?: string) => !!op && op !== 'and' && op !== 'or'   // comparator → bare slot
const normOp = (op?: string) => (op === 'not' ? '!=' : (op ?? 'and'))  // legacy 'not' → ≠

interface CondOpt { key: string; label: string; source: string; condition: string }

// Build the condition dropdown from what's actually flowing in: one option per
// input slot (value1/value2/text1…), plus class/count/any for a detection
// input. Falls back to the generic types before the flow has run.
function buildOptions(preview?: { type: string; slot?: string }[]): CondOpt[] {
  const generic = (): CondOpt[] =>
    CONDITIONS.map((c) => ({ key: c.key, label: c.label, source: '', condition: c.key }))
  if (!preview || preview.length === 0) return generic()
  const opts: CondOpt[] = []
  let detectDone = false
  for (const p of preview) {
    const slot = p.slot ?? ''
    if (p.type === 'number' && slot) opts.push({ key: slot, label: slot, source: slot, condition: 'value' })
    else if (p.type === 'text' && slot) opts.push({ key: slot, label: slot, source: slot, condition: 'text' })
    else if (p.type === 'count' && slot) opts.push({ key: slot, label: slot, source: slot, condition: 'count' })
    else if (p.type === 'detect' && !detectDone) {
      detectDone = true
      opts.push({ key: 'detect:class', label: 'class =',    source: 'detect', condition: 'class' })
      opts.push({ key: 'detect:count', label: 'count',      source: 'detect', condition: 'count' })
      opts.push({ key: 'detect:any',   label: 'any detect', source: 'detect', condition: 'any_detected' })
    }
  }
  return opts.length ? opts : generic()
}

// Source node types whose output slot type is unambiguous — used to show
// value1/text1/… in the dropdown BEFORE the flow has run. Ambiguous sources
// (e.g. JSON Extract, whose path types depend on the data) are left to the
// runtime inputs_preview, which is exact and always preferred.
const NUMBER_SRC = new Set(['number', 'random_number', 'math_op', 'math_function', 'clamp', 'map_range', 'statistics'])
const TEXT_SRC = new Set(['text_input', 'speech_to_text', 'join_text', 'text_transform'])
const DETECT_SRC = new Set(['detect', 'pose'])

function staticSlots(
  targetId: string,
  nodes: { id: string; type?: string }[],
  edges: { source: string; target: string }[],
): { type: string; slot: string }[] {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]))
  const out: { type: string; slot: string }[] = []
  let nv = 0, nt = 0, detectDone = false
  for (const e of edges) {
    if (e.target !== targetId) continue
    const t = typeById.get(e.source)
    if (!t) continue
    if (NUMBER_SRC.has(t)) out.push({ type: 'number', slot: `value${++nv}` })
    else if (TEXT_SRC.has(t)) out.push({ type: 'text', slot: `text${++nt}` })
    else if (DETECT_SRC.has(t) && !detectDone) { detectDone = true; out.push({ type: 'detect', slot: 'detect' }) }
  }
  return out
}

// The dropdown key matching a (source, condition).
function branchOptKey(b: TermLike): string {
  if (b.source === 'detect') {
    return b.condition === 'class' ? 'detect:class' : b.condition === 'count' ? 'detect:count' : 'detect:any'
  }
  return b.source || b.condition
}

// Auto-size selects/inputs to their content (Chromium 123+; older Chromium
// just keeps the min-width — degrades gracefully).
const GROW = { fieldSizing: 'content' } as unknown as React.CSSProperties

// Slot dropdown + value box for ONE condition term (the branch's own condition
// or an extra and/or term). The slot select sets {source, condition}; the box
// edits {value}.
function TermFields({ term, condOptions, onChange, stop, hideExpr }: {
  term: TermLike
  condOptions: CondOpt[]
  onChange: (patch: { source?: string; condition?: string; value?: string }) => void
  stop: (e: React.MouseEvent) => void
  hideExpr?: boolean   // NOT terms are a bare slot (value compared, no expression)
}) {
  const curKey = branchOptKey(term)
  const opts = condOptions.some((o) => o.key === curKey)
    ? condOptions
    : [{
        key: curKey,
        label: term.source || (CONDITIONS.find((c) => c.key === term.condition)?.label ?? term.condition),
        source: term.source ?? '',
        condition: term.condition,
      }, ...condOptions]
  return (
    <>
      {/* Slot select — sizes to its text, custom ▾ (thinner than native arrow) */}
      <span className="relative inline-flex items-center flex-shrink-0">
        <select
          value={curKey}
          onClick={stop}
          onChange={(e) => { const o = opts.find((x) => x.key === e.target.value); if (o) onChange({ source: o.source, condition: o.condition }) }}
          style={GROW}
          className="nodrag appearance-none text-xs bg-zinc-800 border border-zinc-700 rounded pl-1.5 pr-3 py-1 text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
        >
          {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <span className="pointer-events-none absolute right-1 text-[8px] text-zinc-500">▾</span>
      </span>
      {!hideExpr && term.condition !== 'any_detected' && (
        <TextInput
          type="text"
          value={term.value ?? ''}
          onClick={stop}
          onChange={(e) => onChange({ value: e.target.value })}
          title={term.condition === 'value' ? 'รวมในช่องเดียว: && (และ), || (หรือ), != เช่น >16 && <18' : undefined}
          style={GROW}
          className="nodrag min-w-[2.5rem] text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
        />
      )}
    </>
  )
}

const statusBorder: Record<NodeStatus, string> = {
  idle:    'border-zinc-700 bg-zinc-900',
  running: 'border-blue-500 bg-zinc-900 animate-pulse',
  success: 'border-violet-500 bg-zinc-900',
  error:   'border-red-500 bg-zinc-900',
  skipped: 'border-zinc-600 bg-zinc-950 opacity-50',
}

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

function defaultBranches(config: Record<string, unknown>): Branch[] {
  // New format
  if (Array.isArray(config.branches)) return config.branches as Branch[]
  // Legacy single-branch
  return [{
    condition: (config.condition as string) ?? 'value',
    value:     (config.value as string) ?? '',
  }]
}

export function IfElseNode({ id, data, selected }: Props) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | {
        result?: boolean
        active_index?: number
        input_value?: number | string | null
        input_text?: string
        inputs_preview?: { label?: string; value: number | string | boolean; type: string; slot?: string }[]
      }
    | undefined
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const selectNode = useFlowStore((s) => s.selectNode)
  const edges = useFlowStore((s) => s.edges)
  const nodes = useFlowStore((s) => s.nodes)

  const branches = defaultBranches(data.config)
  const activeIndex = output?.active_index ?? -1
  // Off (default) = one output handle that emits the matched branch's result.
  // On = a separate output handle per branch (routes/skip downstream).
  const multiOutput = !!(data.config?.multi_output)

  // Dropdown options derived from the live inputs: one per slot (value1/value2/
  // text1…) + class/count/any for a detection input. Prefer the exact runtime
  // preview; before the flow runs, fall back to a static guess from connected
  // source node types so slots still show; generic types if neither applies.
  const runtimePreview = output?.inputs_preview
  const preview = (runtimePreview && runtimePreview.length)
    ? runtimePreview
    : staticSlots(id, nodes, edges)
  const condOptions = buildOptions(preview)

  const updateBranches = (next: Branch[]) =>
    updateNodeConfig(id, { branches: next })

  const setBranch = (i: number, patch: Partial<Branch>) => {
    const next = branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b))
    updateBranches(next)
  }

  type Term = NonNullable<Branch['terms']>[number]
  const updateTerm = (i: number, j: number, patch: Partial<Term>) => {
    updateBranches(branches.map((b, idx) => {
      if (idx !== i) return b
      const terms = [...(b.terms ?? [])]
      terms[j] = { ...terms[j], ...patch }
      return { ...b, terms }
    }))
  }
  const addTerm = (i: number, op: string) => {
    if (!OP_OPTIONS.some((o) => o.v === op)) return
    const def = condOptions[0] ?? { source: '', condition: 'value' }
    const t: Term = { op: op as Term['op'], source: def.source, condition: def.condition, value: '' }
    updateBranches(branches.map((b, idx) => (idx === i ? { ...b, terms: [...(b.terms ?? []), t] } : b)))
  }
  const removeTerm = (i: number, j: number) => {
    updateBranches(branches.map((b, idx) => (idx === i ? { ...b, terms: (b.terms ?? []).filter((_, k) => k !== j) } : b)))
  }

  const addBranch = (e: React.MouseEvent) => {
    e.stopPropagation()
    // If last branch is "else", insert before it
    const last = branches[branches.length - 1]
    const def = condOptions[0] ?? { source: '', condition: 'value' }
    const newBranch: Branch = { condition: def.condition, source: def.source, value: '' }
    if (last?.condition === 'else') {
      updateBranches([...branches.slice(0, -1), newBranch, last])
    } else {
      updateBranches([...branches, newBranch])
    }
  }

  const addElse = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (branches.some((b) => b.condition === 'else')) return
    updateBranches([...branches, { condition: 'else' }])
  }

  const removeBranch = (e: React.MouseEvent, i: number) => {
    e.stopPropagation()
    if (branches.length <= 1) return  // at least one branch
    updateBranches(branches.filter((_, idx) => idx !== i))
  }

  const hasElse = branches.some((b) => b.condition === 'else')

  return (
    <div
      onClick={() => selectNode(id)}
      className={cn(
        'rounded-xl border-2 cursor-pointer transition-all duration-200 min-w-[320px] max-w-[560px] shadow-lg shadow-black/20',
        statusBorder[status],
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-700/60 bg-zinc-800/40 rounded-t-[10px]">
        <span className="grid place-items-center w-6 h-6 rounded-md bg-violet-500/15 text-sm leading-none flex-shrink-0">🔀</span>
        <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">{data.label}</span>
        {/* Fixed "ค่าที่เข้ามา:" chip — hover to see each input on its own line. */}
        {output?.inputs_preview && output.inputs_preview.length > 0 && (() => {
          const lines = output.inputs_preview
            .map((p) => `${String(p.value)}(${p.slot ?? TYPE_LABEL[p.type] ?? p.type})`)
            .join('\n')
          return (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900/70 text-cyan-300 border border-zinc-700/60 flex-shrink-0 cursor-help"
              title={`ค่าที่เข้ามา:\n${lines}`}
            >
              ค่าที่เข้ามา:
            </span>
          )
        })()}
        {output?.result !== undefined && (
          <span className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            status === 'running' ? 'bg-blue-400 animate-ping' :
            output.result ? 'bg-emerald-400' : 'bg-zinc-600'
          )} />
        )}
      </div>

      {/* Branches */}
      <div className="divide-y divide-zinc-800/70">
        {branches.map((branch, i) => {
          const isElse = branch.condition === 'else'
          const isActive = activeIndex === i
          const label = i === 0 ? 'IF' : isElse ? 'ELSE' : 'ELSE IF'

          return (
            <div
              key={i}
              className={cn('relative px-3 py-2 transition-colors', isActive && 'bg-emerald-500/[0.06]')}
            >
              {/* Left accent bar — branch type / active state */}
              <span className={cn(
                'absolute left-0 inset-y-1.5 w-[3px] rounded-r',
                isActive ? 'bg-emerald-500' : isElse ? 'bg-amber-500/70' : 'bg-violet-500/70'
              )} />

              {/* Condition line */}
              <div className="flex items-start gap-1.5">
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide flex-shrink-0 mt-0.5',
                  isActive ? 'bg-emerald-500/20 text-emerald-300'
                  : isElse ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-violet-500/15 text-violet-300'
                )}>
                  {label}
                </span>

                {!isElse ? (
                  <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                    {/* Main condition (term 0) */}
                    <TermFields
                      term={branch}
                      condOptions={condOptions}
                      stop={(e) => e.stopPropagation()}
                      onChange={(p) => setBranch(i, p)}
                    />
                    {/* Extra AND / OR / NOT terms */}
                    {(branch.terms ?? []).map((t, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <select
                          value={normOp(t.op)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value === '') removeTerm(i, j)   // blank = remove this term
                            else updateTerm(i, j, { op: e.target.value as Term['op'] })
                          }}
                          title="AND/OR = รวมเงื่อนไข · = ≠ > < ≥ ≤ = เทียบ 2 ค่า · ช่องว่าง = ลบ"
                          className="nodrag w-9 text-center text-[10px] font-bold bg-violet-500/15 border border-violet-700/40 rounded px-0 py-1 text-violet-300 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
                        >
                          <option value=""></option>
                          {OP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                        </select>
                        <TermFields
                          term={t}
                          condOptions={condOptions}
                          stop={(e) => e.stopPropagation()}
                          onChange={(p) => updateTerm(i, j, p)}
                          hideExpr={isCmpOp(t.op)}
                        />
                      </span>
                    ))}
                    {/* Arrow-only dropdown — pick AND / OR / NOT to add a term */}
                    <select
                      value=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => addTerm(i, e.target.value)}
                      title="เพิ่มเงื่อนไข — AND/OR หรือตัวเทียบ = ≠ > < ≥ ≤"
                      className="nodrag w-4 text-xs text-center bg-zinc-800 border border-zinc-700 rounded px-0 py-1 text-zinc-500 hover:text-violet-300 hover:border-violet-600 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
                    >
                      <option value="">▾</option>
                      {OP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="text-xs italic text-zinc-500 flex-1 mt-0.5">เมื่อไม่ตรงเงื่อนไขใดเลย</span>
                )}

                {/* Remove branch (not on first) */}
                {i > 0 && (
                  <button
                    onClick={(e) => removeBranch(e, i)}
                    className="nodrag p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                    title="ลบ branch นี้"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Output line */}
              <div className="flex items-center gap-1.5 mt-1.5 pl-0.5">
                <span className="text-[10px] text-zinc-500 flex-shrink-0 select-none">→ แสดงผล</span>
                <TextInput
                  type="text"
                  value={branch.output_text ?? ''}
                  onChange={(e) => setBranch(i, { output_text: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="ข้อความเมื่อเข้าเงื่อนไข"
                  className="nodrag flex-1 min-w-0 text-xs bg-zinc-900/60 border border-zinc-800 rounded px-1.5 py-1 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Per-branch output handle — only in multi-output mode */}
              {multiOutput && (
                <Handle
                  id={`branch_${i}`}
                  type="source"
                  position={Position.Right}
                  className={cn(
                    '!w-3 !h-3 !border-2',
                    isActive
                      ? '!bg-emerald-500 !border-emerald-700'
                      : '!bg-zinc-500 !border-zinc-700 hover:!bg-violet-400'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Single output handle (default) — emits the matched branch's result.
          Lives at node level so it centers on the right edge. */}
      {!multiOutput && (
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className={cn(
            '!w-3 !h-3 !border-2',
            output?.result ? '!bg-emerald-500 !border-emerald-700' : '!bg-zinc-500 !border-zinc-700 hover:!bg-violet-400'
          )}
        />
      )}

      {/* Add buttons + output-mode toggle */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-zinc-700/50">
        <button
          onClick={addBranch}
          className="nodrag flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-violet-300/90 hover:text-violet-200 bg-violet-500/10 hover:bg-violet-500/20 rounded-md border border-violet-700/30"
          title="เพิ่ม else if"
        >
          <Plus size={12} /> else if
        </button>
        {!hasElse && (
          <button
            onClick={addElse}
            className="nodrag flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-300/90 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded-md border border-amber-700/30"
            title="เพิ่ม else (กรณีไม่ตรงเงื่อนไขใดเลย)"
          >
            <Plus size={12} /> else
          </button>
        )}
        <label
          onClick={(e) => e.stopPropagation()}
          className="nodrag ml-auto flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer select-none"
          title="ปิด = ทางออกเดียว (ส่งผลของ branch ที่เข้าเงื่อนไข) / เปิด = ทางออกแยกตาม branch"
        >
          multi-output
          <input
            type="checkbox"
            checked={multiOutput}
            onChange={(e) => updateNodeConfig(id, { multi_output: e.target.checked })}
            className="nodrag accent-violet-500 w-3 h-3"
          />
        </label>
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400"
      />
    </div>
  )
}
