'use client'

import { useState } from 'react'
import {
  Play, Square, Settings, AlertTriangle,
  Infinity as InfinityIcon, Undo2, Redo2, Trash2,
} from 'lucide-react'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConnectorButton } from '@/components/extensions/ConnectorButton'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useNativeStore } from '@/stores/nativeStore'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { cn } from '@/lib/utils'



interface Props {
  onSave: () => void
  onRun: () => void
  onStop: () => void
  saveError?: boolean
}

/**
 * Top bar above the canvas — holds all flow-level actions
 * (history / save / auto / run / settings) plus live runtime badges.
 */
export function CanvasTopBar({ onSave, onRun, onStop, saveError }: Props) {
  const canUndo   = useFlowStore((s) => s.canUndo)
  const canRedo   = useFlowStore((s) => s.canRedo)
  const undo      = useFlowStore((s) => s.undo)
  const redo      = useFlowStore((s) => s.redo)
  const clearAll  = useFlowStore((s) => s.clearAll)
  const nodeCount = useFlowStore((s) => s.nodes.length)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const isLive    = useNativeStore((s) => s.running)   // native run blocks Auto
  const isAuto    = useAutoRunStore((s) => s.isAuto)
  const toggleAuto = useAutoRunStore((s) => s.toggle)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleClear = () => {
    if (nodeCount === 0) return
    if (confirm('ต้องการลบทั้งหมดใช่หรือไม่?\nblock และเส้นเชื่อมทั้งหมดจะถูกลบ')) {
      clearAll()
    }
  }

  return (
    <div className="h-12 bg-zinc-900/80 border-b border-zinc-800 flex items-center px-4 gap-2 backdrop-blur-sm">
      {/* Runtime badge — only RUNNING (LIVE indicator lives on the Webcam node) */}
      <div className="flex items-center gap-3">
        {isRunning && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            RUNNING
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* History — undo / redo / clear */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          title="ย้อนกลับ (Undo)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          title="ถัดไป (Redo)"
        >
          <Redo2 size={14} />
        </button>
        <button
          onClick={handleClear}
          disabled={nodeCount === 0}
          className="p-1.5 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-zinc-400 hover:text-red-400 transition-colors"
          title="ล้างหน้าจอ"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Save: silent auto-save. Only surface a failure; Ctrl+S still saves now. */}
      {saveError && (
        <span
          onClick={onSave}
          title="คลิกเพื่อลองบันทึกใหม่"
          className="flex items-center gap-1.5 text-[10px] text-red-400 cursor-pointer hover:text-red-300"
        >
          <AlertTriangle size={11} />
          บันทึกไม่สำเร็จ — คลิกลองใหม่
        </span>
      )}

      {/* Auto */}
      <button
        onClick={toggleAuto}
        disabled={isLive}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed',
          isAuto
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
        )}
        title={isLive ? 'ปิด Live ก่อนเพื่อใช้ Auto' : 'รันต่อเนื่องอัตโนมัติเมื่อมีการเปลี่ยนแปลง'}
      >
        <InfinityIcon size={13} className={isAuto ? 'animate-pulse' : ''} />
        {isAuto ? 'Auto ●' : 'Auto'}
      </button>

      {/* Run / Stop */}
      {isRunning ? (
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-all"
        >
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button
          onClick={onRun}
          disabled={isLive}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-40"
        >
          <Play size={12} fill="currentColor" />
          Run Flow
        </button>
      )}

      {/* Connector — board connection (Arduino Connect / Flash) */}
      <ConnectorButton variant="compact" />

      {/* Settings */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="ml-1 p-1.5 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
        title="ตั้งค่า"
      >
        <Settings size={15} />
      </button>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
