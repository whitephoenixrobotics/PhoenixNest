import { useCallback, useEffect, useRef } from 'react'
import { useExecutionStore } from '@/stores/executionStore'
import { getAccessToken } from '@/lib/auth'
import { runtimeWsUrl } from '@/lib/desktop'
import type { NodeExecutionUpdate } from '@/types'

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

export function useFlowExecution() {
  const wsRef = useRef<WebSocket | null>(null)
  const { startExecution, updateNodeState, finishExecution, resetExecution } = useExecutionStore()

  const connect = useCallback(async (executionId: string) => {
    startExecution(executionId)

    const token = await getAccessToken()
    const base = runtimeWsUrl() || DEFAULT_WS_URL
    const ws = new WebSocket(`${base}/ws/executions/${executionId}?token=${encodeURIComponent(token ?? '')}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      // A malformed frame must not throw — if it were the execution_finished
      // frame, the UI would stay stuck on "running" forever.
      let data: NodeExecutionUpdate & { type?: string }
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      if (data.type === 'execution_finished') {
        finishExecution()
        ws.close()
        return
      }

      updateNodeState(data.node_id, {
        status: data.status,
        output: data.output,
        error: data.error,
        duration_ms: data.duration_ms,
      })
    }

    ws.onerror = () => finishExecution()
    ws.onclose = () => finishExecution()
  }, [startExecution, updateNodeState, finishExecution])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    resetExecution()
  }, [resetExecution])

  useEffect(() => {
    return () => { wsRef.current?.close() }
  }, [])

  return { connect, disconnect }
}
