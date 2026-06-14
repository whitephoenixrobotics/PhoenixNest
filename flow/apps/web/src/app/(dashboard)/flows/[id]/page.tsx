'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FlowCanvas } from '@/components/canvas/FlowCanvas'
import { NodePalette } from '@/components/canvas/NodePalette'
import { CanvasTopBar } from '@/components/canvas/CanvasTopBar'
import { NodeConfigPanel } from '@/components/panels/NodeConfigPanel'
import { useFlowStore } from '@/stores/flowStore'
import { useAutoRunStore } from '@/stores/autoRunStore'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { useFlowExecution } from '@/hooks/useFlowExecution'
import { flowsApi, projectsApi, apiErrorMessage } from '@/lib/api-client'
import { uiAlert } from '@/lib/dialog'
import type { Flow } from '@/types'

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [flow, setFlow] = useState<Flow | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { loadDefinition, getDefinition, selectedNodeId, markClean } = useFlowStore()
  const isDirty = useFlowStore((s) => s.isDirty)
  const paletteCollapsed = useExtensionsStore((s) => s.paletteCollapsed)
  const togglePalette    = useExtensionsStore((s) => s.togglePalette)
  const { connect, disconnect } = useFlowExecution()

  // Load the flow. On failure (backend down, 404, …) surface the error instead
  // of hanging on "Loading flow..." forever.
  const loadFlow = useCallback(() => {
    flowsApi.get(id)
      .then((res) => {
        setLoadError(null)
        setFlow(res.data)
        if (res.data?.definition) loadDefinition(res.data.definition)
      })
      .catch((err) => setLoadError(apiErrorMessage(err)))
  }, [id, loadDefinition])

  useEffect(() => { loadFlow() }, [loadFlow])

  // Tear AUTO down when leaving the editor route. Without this the 300ms tick
  // (and its /ws/preview socket) outlives the page — a flow with hardware
  // write nodes would keep driving the Arduino after navigate-away.
  useEffect(() => {
    return () => {
      const auto = useAutoRunStore.getState()
      if (auto.isAuto) auto.toggle()  // turns off → clears interval, closes socket
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!flow) return
    try {
      const definition = getDefinition()
      await flowsApi.update(id, { definition })
      markClean()
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [flow, id, getDefinition, markClean])

  // Auto-save: persist ~1.5s after the last edit (debounced). The Save button
  // becomes a status indicator + manual "save now".
  useEffect(() => {
    if (!flow || !isDirty) return
    const t = setTimeout(() => { handleSave() }, 1500)
    return () => clearTimeout(t)
  }, [isDirty, flow, handleSave])

  // Ctrl/Cmd+S → save now (muscle memory; auto-save still runs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleRun = useCallback(async () => {
    try {
      // Persist the current canvas (nodes, edges, uploaded images) before running,
      // since the backend executes the saved definition from the database.
      const definition = getDefinition()
      await flowsApi.update(id, { definition })
      markClean()

      const res = await flowsApi.execute(id)
      connect(res.data.execution_id)
    } catch (err) {
      console.error('Failed to run flow', err)
      await uiAlert(`รันไม่สำเร็จ\n${apiErrorMessage(err)}`)
    }
  }, [id, connect, getDefinition, markClean])

  const handleRename = useCallback(async (next: string) => {
    if (!flow) return
    setFlow((f) => (f ? { ...f, name: next } : f))
    try {
      await flowsApi.update(id, { name: next })
      // The home page lists PROJECT names — rename the parent project too,
      // so the dashboard card matches the name typed in the editor.
      if (flow.project_id) await projectsApi.update(flow.project_id, { name: next })
    } catch (err) {
      console.error('Failed to rename flow', err)
    }
  }, [flow, id])

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-300 gap-4 px-6 text-center">
        <div className="text-zinc-300">โหลด flow ไม่สำเร็จ</div>
        <div className="text-sm text-red-400 max-w-md">{loadError}</div>
        <div className="text-xs text-zinc-600 max-w-md">
          ตรวจสอบว่าหน้าต่าง “Phoenix Flow - Backend” ยังเปิดอยู่ (พอร์ต 8000) — ถ้าปิดไป ให้รัน start.bat ใหม่
        </div>
        <div className="flex gap-2">
          <button onClick={loadFlow} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg">
            ลองใหม่
          </button>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg">
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    )
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        Loading flow...
      </div>
    )
  }

  return (
    // spellCheck off here is inherited by every input/textarea in the editor,
    // so no browser red squiggles on field/template text.
    <div className="flex h-screen bg-zinc-950 overflow-hidden" spellCheck={false}>
      {/* Sidebar — collapsible. A small toggle tab sits on the seam so the
          user can hide / restore the palette without hunting in the top bar. */}
      {!paletteCollapsed && (
        <aside className="w-64 h-full flex flex-col bg-zinc-900 border-r border-zinc-800">
          <NodePalette flowName={flow.name} onRename={handleRename} />
        </aside>
      )}

      {/* Right column — top bar (only over canvas) + canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <CanvasTopBar
          onSave={handleSave}
          onRun={handleRun}
          onStop={disconnect}
          saveError={saveError}
        />
        <main className="flex-1 relative">
          {/* Floating toggle tab on the palette/canvas seam — slim vertical pill,
              shows the opposite chevron depending on whether the palette is open. */}
          <button
            onClick={togglePalette}
            title={paletteCollapsed ? 'แสดงแท็บเครื่องมือ' : 'ซ่อนแท็บเครื่องมือ'}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-20 w-2.5 h-8 flex items-center justify-center rounded-r bg-zinc-800/60 hover:bg-zinc-700 border border-l-0 border-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {paletteCollapsed ? <ChevronRight size={9} /> : <ChevronLeft size={9} />}
          </button>
          <FlowCanvas />
        </main>
      </div>

      {selectedNodeId && <NodeConfigPanel />}
    </div>
  )
}
