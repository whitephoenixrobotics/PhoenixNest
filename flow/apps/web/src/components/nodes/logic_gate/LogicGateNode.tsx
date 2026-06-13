'use client'

import { Handle, Position } from '@xyflow/react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import type { NodeStatus } from '@/types'
import { GateSymbol } from './GateSymbols'

// Gate metadata
const GATE_META: Record<string, { symbol: string; desc: string; color: string }> = {
  gate_and:  { symbol: 'AND',  desc: 'ทุกตัวเป็น True',    color: 'text-violet-400' },
  gate_or:   { symbol: 'OR',   desc: 'มีตัวใดเป็น True',   color: 'text-violet-400' },
  gate_not:  { symbol: 'NOT',  desc: 'กลับค่า',           color: 'text-violet-400' },
  gate_nand: { symbol: 'NAND', desc: 'NOT AND',          color: 'text-violet-300' },
  gate_nor:  { symbol: 'NOR',  desc: 'NOT OR',           color: 'text-violet-300' },
  gate_xor:  { symbol: 'XOR',  desc: 'ต่างกันเป็น True',   color: 'text-violet-400' },
  gate_xnor: { symbol: 'XNOR', desc: 'เหมือนกันเป็น True', color: 'text-violet-300' },
}

const statusBorder: Record<NodeStatus, string> = {
  idle:    'border-zinc-700 bg-zinc-900',
  running: 'border-blue-500 bg-zinc-900 animate-pulse',
  success: 'border-violet-500 bg-zinc-900',
  error:   'border-red-500 bg-zinc-900',
  skipped: 'border-zinc-600 bg-zinc-950 opacity-40',
}

interface Props {
  id: string
  type?: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function LogicGateNode({ id, type, selected }: Props) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { result?: boolean }
    | undefined
  const selectNode = useFlowStore((s) => s.selectNode)

  const meta  = GATE_META[type ?? ''] ?? { symbol: '?', desc: '', color: 'text-zinc-400' }
  const isNot = type === 'gate_not'
  const result = output?.result

  return (
    <div
      onClick={() => selectNode(id)}
      className={cn(
        'rounded-xl border-2 cursor-pointer transition-all duration-200',
        statusBorder[status],
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
      style={{ minWidth: 130 }}
    >
      {/* Header — compact label + status dot */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-700/50">
        <span className={cn('text-[11px] font-bold font-mono', meta.color)}>
          {meta.symbol}
        </span>
        <span className="flex-1" />
        {result !== undefined && (
          <span className={cn(
            'text-[10px] font-bold font-mono px-1.5 rounded',
            result ? 'bg-emerald-500/20 text-emerald-400'
                   : 'bg-red-500/20 text-red-400'
          )}>
            {result ? '1' : '0'}
          </span>
        )}
        <span className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          status === 'running' ? 'bg-blue-400 animate-ping' :
          result === true  ? 'bg-emerald-400' :
          result === false ? 'bg-red-400'     : 'bg-zinc-600'
        )} />
      </div>

      {/* Symbol */}
      <div className="px-2 py-2">
        <GateSymbol type={type ?? ''} className="w-full h-12" />
      </div>

      {/* Input handles — aligned to the SVG pin positions */}
      {isNot ? (
        <Handle
          type="target"
          position={Position.Left}
          style={{ top: '60%' }}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400"
        />
      ) : (
        <>
          <Handle
            id="a"
            type="target"
            position={Position.Left}
            style={{ top: '50%' }}
            className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400"
          />
          <Handle
            id="b"
            type="target"
            position={Position.Left}
            style={{ top: '75%' }}
            className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400"
          />
        </>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ top: '60%' }}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-700 hover:!bg-violet-400"
      />
    </div>
  )
}
