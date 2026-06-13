'use client'

import { Handle, Position, NodeResizer } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import type { NodeStatus } from '@/types'

const statusStyles: Record<NodeStatus, string> = {
  idle: 'border-zinc-700 bg-zinc-900',
  running: 'border-blue-500 bg-zinc-900 shadow-blue-500/30 shadow-lg animate-pulse',
  success: 'border-emerald-500 bg-zinc-900 shadow-emerald-500/20 shadow-md',
  error: 'border-red-500 bg-zinc-900 shadow-red-500/20 shadow-md',
  skipped: 'border-zinc-600 bg-zinc-950 opacity-60',
}

const statusDot: Record<NodeStatus, string> = {
  idle: 'bg-zinc-500',
  running: 'bg-blue-400 animate-ping',
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  skipped: 'bg-zinc-600',
}

interface BaseNodeProps {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
  icon: React.ReactNode
  children?: React.ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  outputHandles?: string[]
  // Drag-to-resize (e.g. Display). `fill` makes the content stretch to fill
  // the resized box instead of sizing to its content.
  resizable?: boolean
  fill?: boolean
  minWidth?: number
  minHeight?: number
  onResize?: (width: number, height: number) => void
}

export function BaseNode({
  id,
  data,
  selected,
  icon,
  children,
  hasInput = true,
  hasOutput = true,
  outputHandles,
  resizable = false,
  fill = false,
  minWidth = 200,
  minHeight = 120,
  onResize,
}: BaseNodeProps) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const selectNode = useFlowStore((s) => s.selectNode)

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 transition-all duration-200 cursor-pointer',
        fill ? 'w-full h-full flex flex-col min-w-[200px]' : 'min-w-[200px]',
        statusStyles[status],
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950'
      )}
      onClick={() => selectNode(id)}
    >
      {resizable && (
        <NodeResizer
          color="#8b5cf6"
          isVisible={!!selected}
          minWidth={minWidth}
          minHeight={minHeight}
          onResize={onResize ? (_, p) => onResize(p.width, p.height) : undefined}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50 flex-shrink-0">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">{data.label}</span>
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', statusDot[status])} />
      </div>

      {/* Content */}
      {children && (
        <div className={cn('px-3 py-2 text-xs text-zinc-400', fill && 'flex-1 min-h-0')}>{children}</div>
      )}

      {/* Handles */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400 transition-colors"
        />
      )}

      {hasOutput && !outputHandles && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400 transition-colors"
        />
      )}

      {outputHandles?.map((handle, i) => (
        <Handle
          key={handle}
          id={handle}
          type="source"
          position={Position.Right}
          style={{ top: `${40 + i * 24}px` }}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-violet-400 transition-colors"
        />
      ))}
    </div>
  )
}
