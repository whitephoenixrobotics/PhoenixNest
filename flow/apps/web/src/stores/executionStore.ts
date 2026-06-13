import { create } from 'zustand'
import type { NodeStatus } from '@/types'

interface NodeExecutionState {
  status: NodeStatus
  output?: Record<string, unknown>
  error?: string
  duration_ms?: number
}

interface ExecutionStore {
  executionId: string | null
  isRunning: boolean
  nodeStates: Record<string, NodeExecutionState>

  startExecution: (executionId: string) => void
  updateNodeState: (nodeId: string, state: NodeExecutionState) => void
  removeNodeState: (nodeId: string) => void
  finishExecution: () => void
  resetExecution: () => void
  getNodeStatus: (nodeId: string) => NodeStatus
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  executionId: null,
  isRunning: false,
  nodeStates: {},

  startExecution: (executionId) =>
    set({ executionId, isRunning: true, nodeStates: {} }),

  updateNodeState: (nodeId, state) =>
    set((s) => ({
      nodeStates: { ...s.nodeStates, [nodeId]: state },
    })),

  removeNodeState: (nodeId) =>
    set((s) => {
      if (!(nodeId in s.nodeStates)) return s
      const next = { ...s.nodeStates }
      delete next[nodeId]
      return { nodeStates: next }
    }),

  finishExecution: () => set({ isRunning: false }),

  resetExecution: () =>
    set({ executionId: null, isRunning: false, nodeStates: {} }),

  getNodeStatus: (nodeId) =>
    get().nodeStates[nodeId]?.status ?? 'idle',
}))
