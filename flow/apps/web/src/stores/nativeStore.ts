import { create } from 'zustand'
import { useFlowStore } from './flowStore'
import { useExecutionStore } from './executionStore'
import { getAccessToken } from '@/lib/auth'
import { runtimeWsUrl } from '@/lib/desktop'

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

// Backend-native processing: the backend owns the source (camera/video file)
// and runs every frame. The browser sends the flow once, then only receives
// results — no per-frame upload. One run at a time across the app.
let ws: WebSocket | null = null
let unsubFlow: (() => void) | null = null
let lastTime = 0

interface Source { type: 'video' | 'webcam'; file_id?: string; index?: number; speed?: number; mirror?: boolean }

interface NativeStore {
  running: boolean
  sourceId: string | null
  progress: { frame: number; total: number } | null
  fps: number
  error: string | null
  start: (sourceId: string, source: Source) => Promise<void>
  stop: () => void
}

function applyOutputs(outputs: Record<string, Record<string, unknown>>) {
  const { updateNodeState } = useExecutionStore.getState()
  for (const [nodeId, out] of Object.entries(outputs)) {
    if (nodeId.startsWith('_')) continue
    const err = (out as { error?: string })?.error
    updateNodeState(nodeId, { status: err ? 'error' : 'success', output: out, error: err })
  }
}

export const useNativeStore = create<NativeStore>((set, get) => {
  const stop = () => {
    try { ws?.send(JSON.stringify({ stop: true })) } catch { /* socket may be closing */ }
    ws?.close()
    ws = null
    unsubFlow?.()
    unsubFlow = null
    set({ running: false, sourceId: null, progress: null, fps: 0 })
  }

  const start = async (sourceId: string, source: Source) => {
    if (get().running) stop()

    // Native is exclusive with the Auto preview path
    const { useAutoRunStore } = await import('./autoRunStore')
    if (useAutoRunStore.getState().isAuto) useAutoRunStore.getState().toggle()

    useExecutionStore.getState().resetExecution()
    const token = await getAccessToken()
    const base = runtimeWsUrl() || DEFAULT_WS_URL
    const socket = new WebSocket(`${base}/ws/native?token=${encodeURIComponent(token ?? '')}`)
    ws = socket
    lastTime = performance.now()
    set({ running: true, sourceId, progress: null, fps: 0, error: null })

    socket.onopen = () => {
      // Late onopen from a previous socket that the user already replaced —
      // don't hijack the new socket's unsubFlow or send on this stale one.
      if (ws !== socket) return
      socket.send(JSON.stringify({
        definition: useFlowStore.getState().getDefinition(),
        source_id: sourceId,
        source,
      }))
      // Flow edits during a run (e.g. moving the counting line) → resend
      unsubFlow = useFlowStore.subscribe(() => {
        if (ws !== socket) return
        try { socket.send(JSON.stringify({ definition: useFlowStore.getState().getDefinition() })) } catch { /* */ }
      })
    }
    socket.onmessage = (e) => {
      let r: { ok?: boolean; outputs?: Record<string, Record<string, unknown>>; progress?: { frame: number; total: number }; done?: boolean; error?: string }
      try { r = JSON.parse(e.data) } catch { return }
      if (r.ok && r.outputs) applyOutputs(r.outputs)
      if (r.progress) {
        const now = performance.now()
        const dt = now - lastTime
        lastTime = now
        set({ progress: r.progress, fps: dt > 0 ? Math.round(1000 / dt) : 0 })
      }
      if (r.ok === false) { set({ error: r.error ?? 'เกิดข้อผิดพลาด' }); stop() }
      else if (r.done) stop()
    }
    socket.onerror = () => stop()
    socket.onclose = () => { if (ws === socket) ws = null }
  }

  return { running: false, sourceId: null, progress: null, fps: 0, error: null, start, stop }
})
