import { create } from 'zustand'
import { useFlowStore } from './flowStore'
import { useExecutionStore } from './executionStore'
import { useNativeStore } from './nativeStore'
import { getAccessToken } from '@/lib/auth'
import { runtimeWsUrl } from '@/lib/desktop'

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

// Auto mode streams previews over a WebSocket (/ws/preview). The flow
// definition — which can contain multi-MB base64 images — is sent only when
// it changes; ordinary ticks are tiny `{}` messages. (The old HTTP version
// re-uploaded the full definition every 250–300ms and lagged big flows.)
let unsubscribe: (() => void) | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let tickInterval: ReturnType<typeof setInterval> | null = null
let ws: WebSocket | null = null
let connecting = false
let inFlight = false
let pending = false
let defDirty = true

// Node types whose output changes on its own — by wall-clock time (Delay,
// Schedule…) OR by polling live hardware (Arduino sensor reads). When any are
// present, Auto-Run keeps ticking so their values stay live in real time
// without the user clicking the block/canvas. (Arduino reads go through the
// serial worker thread and just read the latest cached sample, so re-running
// them every tick is cheap and never blocks.)
const TIME_DEPENDENT_TYPES = new Set([
  'delay', 'schedule', 'hold', 'interval',
  'arduino_analog_read', 'arduino_digital_read',
])

function hasTimeDependentNode(): boolean {
  return useFlowStore.getState().nodes.some((n) => TIME_DEPENDENT_TYPES.has(n.type))
}

interface AutoRunStore {
  isAuto: boolean
  toggle: () => void
}

function applyOutputs(outputs: Record<string, Record<string, unknown>>) {
  const { updateNodeState } = useExecutionStore.getState()
  for (const [nodeId, out] of Object.entries(outputs)) {
    const err = (out as { error?: string })?.error
    updateNodeState(nodeId, {
      status: err ? 'error' : 'success',
      output: out,
      error: err,
    })
  }
}

async function connect() {
  if (connecting || ws) return
  // AUTO may have been switched off before we even started.
  if (!useAutoRunStore.getState().isAuto) return
  connecting = true
  try {
    const token = await getAccessToken()
    // Re-check AFTER the await: during the getAccessToken() window AUTO may
    // have been turned off, or another caller may have already opened a socket.
    // This is the load-bearing guard that prevents a SECOND /ws/preview socket
    // (the double-socket that doubled the serial write rate and fed the freeze).
    if (!useAutoRunStore.getState().isAuto || ws) return
    const base = runtimeWsUrl() || DEFAULT_WS_URL
    const socket = new WebSocket(`${base}/ws/preview?token=${encodeURIComponent(token ?? '')}`)
    ws = socket

    socket.onopen = () => runPreview()
    socket.onmessage = (event) => {
      inFlight = false
      try {
        const r = JSON.parse(event.data)
        if (r.ok && r.outputs) applyOutputs(r.outputs)
      } catch {
        /* malformed frame — skip */
      }
      if (pending) {
        pending = false
        scheduleRun()
      }
    }
    socket.onclose = () => {
      if (ws === socket) ws = null
      inFlight = false
    }
    socket.onerror = () => socket.close()
  } finally {
    connecting = false
  }
}

function disconnect() {
  ws?.close()
  ws = null
  inFlight = false
  pending = false
}

function runPreview() {
  // A native run already drives the pipeline at full speed — don't double-write
  // node states (preview would call the source handler with no frame and
  // overwrite the native run's good outputs with errors).
  if (useNativeStore.getState().running) return

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Reconnect is owned SOLELY by the tick (see toggle()), so there is exactly
    // one connect() path. Here we just bail — don't open a competing socket.
    return
  }
  if (inFlight) {
    pending = true
    return
  }

  const msg: Record<string, unknown> = {}
  if (defDirty) {
    msg.definition = useFlowStore.getState().getDefinition()
    defDirty = false
  }
  try {
    ws.send(JSON.stringify(msg))
    inFlight = true
  } catch {
    inFlight = false
  }
}

function scheduleRun() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runPreview, 250)
}

export const useAutoRunStore = create<AutoRunStore>((set, get) => ({
  isAuto: false,
  toggle: () => {
    if (get().isAuto) {
      // turn off
      unsubscribe?.()
      unsubscribe = null
      if (debounceTimer) clearTimeout(debounceTimer)
      if (tickInterval) clearInterval(tickInterval)
      tickInterval = null
      disconnect()
      set({ isAuto: false })
    } else {
      // turn on — connect, run once, then re-run on any flow change
      set({ isAuto: true })
      defDirty = true
      void connect()
      unsubscribe = useFlowStore.subscribe(() => {
        defDirty = true
        scheduleRun()
      })

      // Periodic tick so time-dependent blocks (Delay, Schedule) advance
      // even when nothing else in the flow changes. Also reconnects when the
      // socket died (backend restart) — without this, flows with no
      // time-dependent block would stay dead until the next user edit.
      tickInterval = setInterval(() => {
        // Single reconnect owner: if the socket died (backend restart), bring
        // it back. Otherwise only re-run the graph when something is actually
        // time-driven. A passive flow (e.g. Switch → Digital Write) no longer
        // re-runs 3x/sec — it updates on switch toggles via the flow-store
        // subscription, which removes the relentless write pressure that fed
        // the Arduino freeze.
        if (!ws) {
          void connect()
        } else if (hasTimeDependentNode()) {
          runPreview()
        }
      }, 300)
    }
  },
}))
