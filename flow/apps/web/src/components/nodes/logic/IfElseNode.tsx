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
}

const CONDITIONS = [
  { key: 'value',        label: 'value' },
  { key: 'text',         label: 'text' },
  { key: 'count',        label: 'count' },
  { key: 'class',        label: 'class =' },
  { key: 'any_detected', label: 'any detect' },
]

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

const ROW_HEIGHT = 72   // px per branch row (condition row + output-text row)
const HEADER_HEIGHT = 42

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
    | { result?: boolean; active_index?: number }
    | undefined
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const selectNode = useFlowStore((s) => s.selectNode)

  const branches = defaultBranches(data.config)
  const activeIndex = output?.active_index ?? -1

  const updateBranches = (next: Branch[]) =>
    updateNodeConfig(id, { branches: next })

  const setBranch = (i: number, patch: Partial<Branch>) => {
    const next = branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b))
    updateBranches(next)
  }

  const addBranch = (e: React.MouseEvent) => {
    e.stopPropagation()
    // If last branch is "else", insert before it
    const last = branches[branches.length - 1]
    const newBranch: Branch = { condition: 'value', value: '' }
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
        'rounded-xl border-2 cursor-pointer transition-all duration-200 min-w-[300px]',
        statusBorder[status],
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50" style={{ height: HEADER_HEIGHT }}>
        <span className="text-lg">🔀</span>
        <span className="text-sm font-semibold text-zinc-100 flex-1">{data.label}</span>
        {output?.result !== undefined && (
          <span className={cn(
            'w-2 h-2 rounded-full',
            status === 'running' ? 'bg-blue-400 animate-ping' :
            output.result ? 'bg-emerald-400' : 'bg-zinc-500'
          )} />
        )}
      </div>

      {/* Branch rows */}
      <div className="py-1">
        {branches.map((branch, i) => {
          const isElse = branch.condition === 'else'
          const isActive = activeIndex === i
          const label = i === 0 ? 'IF' : isElse ? 'ELSE' : 'ELSE IF'

          return (
            <div
              key={i}
              className={cn(
                'px-2 py-1.5 relative space-y-1',
                isActive && 'bg-emerald-500/10'
              )}
              style={{ minHeight: ROW_HEIGHT }}
            >
              {/* Row 1 — condition */}
              <div className="flex items-center gap-1">
                <span className={cn(
                  'text-xs font-mono font-bold w-14 flex-shrink-0',
                  isElse ? 'text-amber-400' : 'text-violet-400'
                )}>
                  {label}
                </span>

                {!isElse && (
                  <>
                    <select
                      value={branch.condition}
                      onChange={(e) => setBranch(i, { condition: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="nodrag text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    {branch.condition !== 'any_detected' && (
                      <TextInput
                        type="text"
                        value={branch.value ?? ''}
                        onChange={(e) => setBranch(i, { value: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={
                          branch.condition === 'value' ? 'เช่น >16 && <18, !19'
                          : branch.condition === 'text' ? 'เช่น = ฝน, contains สวน'
                          : 'ค่า'
                        }
                        title={
                          branch.condition === 'value'
                            ? 'รวมเงื่อนไขได้: && (และ), || (หรือ), ! หรือ != (ไม่เท่ากับ) เช่น >16 && <18'
                            : undefined
                        }
                        className="nodrag flex-1 min-w-0 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
                      />
                    )}
                  </>
                )}
                {isElse && (
                  <span className="text-xs italic text-zinc-500 flex-1">(เมื่อทุกเงื่อนไขไม่ตรง)</span>
                )}

                {/* Remove button (not on first branch) */}
                {i > 0 && (
                  <button
                    onClick={(e) => removeBranch(e, i)}
                    className="nodrag p-0.5 hover:bg-red-500/20 rounded text-zinc-500 hover:text-red-400"
                    title="ลบ branch"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Row 2 — output text (optional) */}
              <div className="flex items-center gap-1 pl-14">
                <span className="text-[10px] text-zinc-600 select-none">→</span>
                <TextInput
                  type="text"
                  value={branch.output_text ?? ''}
                  onChange={(e) => setBranch(i, { output_text: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="ข้อความ output (ว่าง = ส่ง True)"
                  className="nodrag flex-1 min-w-0 text-xs bg-zinc-800/60 border border-zinc-800 rounded px-1.5 py-1 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Output handle — centered vertically within this row */}
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
            </div>
          )
        })}
      </div>

      {/* Add buttons — bottom-left */}
      <div className="flex items-center gap-1.5 px-2 pb-2 pt-1 border-t border-zinc-700/50">
        <button
          onClick={addBranch}
          className="nodrag flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-violet-300 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700"
          title="เพิ่ม else if"
        >
          <Plus size={12} /> else if
        </button>
        {!hasElse && (
          <button
            onClick={addElse}
            className="nodrag flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-amber-300 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700"
            title="เพิ่ม else (catch-all)"
          >
            <Plus size={12} /> else
          </button>
        )}
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
