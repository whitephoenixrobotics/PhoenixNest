export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped'

export interface NodeConfig {
  [key: string]: unknown
}

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    config: NodeConfig
  }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface FlowDefinition {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export interface Flow {
  id: string
  project_id: string
  name: string
  description: string
  definition: FlowDefinition
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface NodeExecutionUpdate {
  execution_id: string
  node_id: string
  node_type: string
  status: NodeStatus
  output?: Record<string, unknown>
  error?: string
  duration_ms?: number
}

// Block palette item
export interface BlockCategory {
  label: string
  icon: string
  blocks: BlockItem[]
}

export interface BlockItem {
  type: string
  label: string
  description: string
  icon: string
  defaultConfig: NodeConfig
}
