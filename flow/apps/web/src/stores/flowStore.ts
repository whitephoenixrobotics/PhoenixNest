import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange, type Connection, addEdge } from '@xyflow/react'
import { useExecutionStore } from './executionStore'
import type { FlowNode, FlowEdge, FlowDefinition } from '@/types'

// ───────── Module-level history (non-reactive snapshot stack) ──────────
const MAX_HISTORY = 50
interface Snapshot { nodes: FlowNode[]; edges: FlowEdge[] }
let history: Snapshot[] = []
let cursor = -1
let commitTimer: ReturnType<typeof setTimeout> | null = null
let suppressCommit = false  // skip commits while undoing/redoing

interface FlowStore {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean

  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: FlowNode) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  deleteNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  loadDefinition: (definition: FlowDefinition) => void
  getDefinition: () => FlowDefinition
  markClean: () => void

  undo: () => void
  redo: () => void
  clearAll: () => void
}

export const useFlowStore = create<FlowStore>((set, get) => {
  // structuredClone instead of JSON round-trips: configs can hold multi-MB
  // base64 images, and stringifying them on every edit froze the UI. Cloned
  // strings are shared (immutable), so this is fast and memory-cheap.
  const snapshot = (): Snapshot => {
    const { nodes, edges } = get()
    return structuredClone({ nodes, edges })
  }

  const commit = () => {
    if (suppressCommit) return
    if (commitTimer) clearTimeout(commitTimer)
    // Debounce so rapid changes (drag, typing) collapse into one history entry
    commitTimer = setTimeout(() => {
      // Drop any "redo" branch — new edits replace future history
      history = history.slice(0, cursor + 1)
      history.push(snapshot())
      if (history.length > MAX_HISTORY) history.shift()
      cursor = history.length - 1
      set({ canUndo: cursor > 0, canRedo: false })
    }, 250)
  }

  const restore = (snap: Snapshot) => {
    suppressCommit = true
    set({
      nodes: structuredClone(snap.nodes),
      edges: structuredClone(snap.edges),
      isDirty: true,
      canUndo: cursor > 0,
      canRedo: cursor < history.length - 1,
    })
    // re-enable commits on the next tick
    setTimeout(() => { suppressCommit = false }, 0)
  }

  return {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isDirty: false,
    canUndo: false,
    canRedo: false,

    setNodes: (nodes) => { set({ nodes, isDirty: true }); commit() },
    setEdges: (edges) => { set({ edges, isDirty: true }); commit() },

    onNodesChange: (changes) => {
      set((state) => ({
        nodes: applyNodeChanges(changes, state.nodes as never) as unknown as FlowNode[],
        isDirty: true,
      }))
      // Drop execution results of removed nodes so no ghost state lingers
      for (const c of changes) {
        if (c.type === 'remove') useExecutionStore.getState().removeNodeState(c.id)
      }
      commit()
    },

    onEdgesChange: (changes) => {
      set((state) => ({
        edges: applyEdgeChanges(changes, state.edges as never) as unknown as FlowEdge[],
        isDirty: true,
      }))
      commit()
    },

    onConnect: (connection) => {
      set((state) => ({
        edges: addEdge(connection, state.edges as never) as unknown as FlowEdge[],
        isDirty: true,
      }))
      commit()
    },

    addNode: (node) => {
      set((state) => ({ nodes: [...state.nodes, node], isDirty: true }))
      commit()
    },

    updateNodeConfig: (nodeId, config) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n
        ),
        isDirty: true,
      }))
      commit()
    },

    deleteNode: (nodeId) => {
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        isDirty: true,
      }))
      useExecutionStore.getState().removeNodeState(nodeId)
      commit()
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    loadDefinition: (definition) => {
      // Reset history with this load as the baseline
      history = [structuredClone({ nodes: definition.nodes, edges: definition.edges })]
      cursor = 0
      set({
        nodes: definition.nodes,
        edges: definition.edges,
        isDirty: false,
        canUndo: false,
        canRedo: false,
      })
    },

    getDefinition: () => {
      const { nodes, edges } = get()
      return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
    },

    markClean: () => set({ isDirty: false }),

    undo: () => {
      if (cursor <= 0) return
      cursor--
      restore(history[cursor])
    },

    redo: () => {
      if (cursor >= history.length - 1) return
      cursor++
      restore(history[cursor])
    },

    clearAll: () => {
      set({ nodes: [], edges: [], selectedNodeId: null, isDirty: true })
      commit()
    },
  }
})
