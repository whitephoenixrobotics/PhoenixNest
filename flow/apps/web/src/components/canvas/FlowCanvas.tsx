'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nanoid } from 'nanoid'
import type { FlowNode, FlowEdge } from '@/types'
import { useFlowStore } from '@/stores/flowStore'
import { useThemeStore } from '@/stores/themeStore'
import { ImageUploadNode } from '@/components/nodes/input/ImageUploadNode'
import { WebcamCaptureNode } from '@/components/nodes/input/WebcamCaptureNode'
import { TextInputNode } from '@/components/nodes/input/TextInputNode'
import { SwitchNode } from '@/components/nodes/input/SwitchNode'
import { ButtonNode } from '@/components/nodes/input/ButtonNode'
import { ColorPickerNode } from '@/components/nodes/input/ColorPickerNode'
import { HotkeyNode } from '@/components/nodes/input/HotkeyNode'
import { SpeechToTextNode } from '@/components/nodes/input/SpeechToTextNode'
import { HttpFetchNode } from '@/components/nodes/input/HttpFetchNode'
import { DrawPadNode } from '@/components/nodes/input/DrawPadNode'
import { JsonExtractNode } from '@/components/nodes/data/JsonExtractNode'
import { DataTableNode } from '@/components/nodes/data/DataTableNode'
import { TableReadNode } from '@/components/nodes/data/TableReadNode'
import { AggregateNode } from '@/components/nodes/data/AggregateNode'
import { FilterNode } from '@/components/nodes/data/FilterNode'
import { JoinTextNode } from '@/components/nodes/data/JoinTextNode'
import { SheetsWriteNode } from '@/components/nodes/data/SheetsWriteNode'
import { TextTransformNode } from '@/components/nodes/data/TextTransformNode'
import { ChartNode } from '@/components/nodes/output/ChartNode'
import { IfElseNode } from '@/components/nodes/logic/IfElseNode'
import { CompareNode } from '@/components/nodes/logic/CompareNode'
import { CounterNode } from '@/components/nodes/logic/CounterNode'
import { ToggleNode } from '@/components/nodes/logic/ToggleNode'
import { TriggerOnceNode } from '@/components/nodes/logic/TriggerOnceNode'
import { HoldNode } from '@/components/nodes/logic/HoldNode'
import { DelayNode } from '@/components/nodes/time/DelayNode'
import { ScheduleNode } from '@/components/nodes/time/ScheduleNode'
import { IntervalNode } from '@/components/nodes/time/IntervalNode'
import { ForEachNode } from '@/components/nodes/loop/ForEachNode'
import { RepeatNode } from '@/components/nodes/loop/RepeatNode'
import { WhileNode } from '@/components/nodes/loop/WhileNode'
import { NumberNode } from '@/components/nodes/math/NumberNode'
import { RandomNode } from '@/components/nodes/math/RandomNode'
import { MathOpNode } from '@/components/nodes/math/MathOpNode'
import { MathFunctionNode } from '@/components/nodes/math/MathFunctionNode'
import { MapRangeNode } from '@/components/nodes/math/MapRangeNode'
import { ClampNode } from '@/components/nodes/math/ClampNode'
import { StatisticsNode } from '@/components/nodes/math/StatisticsNode'
import { LogicGateNode } from '@/components/nodes/logic_gate/LogicGateNode'
import { DetectNode } from '@/components/nodes/ai/DetectNode'
import { ClassifierNode } from '@/components/nodes/ai/ClassifierNode'
import { PoseNode } from '@/components/nodes/ai/PoseNode'
import { ObjectCountNode } from '@/components/nodes/ai/ObjectCountNode'
import { ColorDetectNode } from '@/components/nodes/ai/ColorDetectNode'
import { OcrNode } from '@/components/nodes/ai/OcrNode'
import { FaceMeshNode } from '@/components/nodes/ai/face/FaceMeshNode'
import { FaceCountNode } from '@/components/nodes/ai/face/FaceCountNode'
import { SmileNode } from '@/components/nodes/ai/face/SmileNode'
import { FaceRecognitionNode } from '@/components/nodes/ai/face/FaceRecognitionNode'
import { EmotionNode } from '@/components/nodes/ai/face/EmotionNode'
import { MnistNode } from '@/components/nodes/dl/MnistNode'
import { StyleTransferNode } from '@/components/nodes/dl/StyleTransferNode'
import { SegmentationNode } from '@/components/nodes/dl/SegmentationNode'
import { DeepDetectNode } from '@/components/nodes/dl/DeepDetectNode'
import { TrackingNode } from '@/components/nodes/dl/TrackingNode'
import { DeepClassifierNode } from '@/components/nodes/dl/DeepClassifierNode'
import { DisplayNode } from '@/components/nodes/output/DisplayNode'
import { LightBulbNode } from '@/components/nodes/output/LightBulbNode'
import { TextToSpeechNode } from '@/components/nodes/output/TextToSpeechNode'
import { PlaySoundNode } from '@/components/nodes/output/PlaySoundNode'
import { ImageEditNode } from '@/components/nodes/image/ImageEditNode'
import { ArduinoNode } from '@/components/nodes/hardware/ArduinoNode'
import { LineNode } from '@/components/nodes/messaging/LineNode'

// Register custom node components here as we build them.
// NOTE: keep these as direct references — React Flow memoizes node rendering
// internally, and each node already subscribes to only its own slice of the
// stores. Wrapping them in React.memo here broke node measurement (fitView
// then zoomed to a broken viewport and nodes vanished / dropped tiny).
const nodeTypes: NodeTypes = {
  if_else: IfElseNode as never,
  compare: CompareNode as never,
  counter: CounterNode as never,
  toggle: ToggleNode as never,
  trigger_once: TriggerOnceNode as never,
  hold: HoldNode as never,
  delay: DelayNode as never,
  schedule: ScheduleNode as never,
  interval: IntervalNode as never,
  for_each: ForEachNode as never,
  repeat: RepeatNode as never,
  while: WhileNode as never,
  number: NumberNode as never,
  random_number: RandomNode as never,
  math_op: MathOpNode as never,
  math_function: MathFunctionNode as never,
  map_range: MapRangeNode as never,
  clamp: ClampNode as never,
  statistics: StatisticsNode as never,
  // Logic gates — all share the same component
  gate_and:  LogicGateNode as never,
  gate_or:   LogicGateNode as never,
  gate_not:  LogicGateNode as never,
  gate_nand: LogicGateNode as never,
  gate_nor:  LogicGateNode as never,
  gate_xor:  LogicGateNode as never,
  gate_xnor: LogicGateNode as never,
  image_upload: ImageUploadNode as never,
  webcam_capture: WebcamCaptureNode as never,
  text_input: TextInputNode as never,
  switch: SwitchNode as never,
  button: ButtonNode as never,
  color_picker: ColorPickerNode as never,
  hotkey: HotkeyNode as never,
  speech_to_text: SpeechToTextNode as never,
  http_fetch: HttpFetchNode as never,
  draw_pad: DrawPadNode as never,
  json_extract: JsonExtractNode as never,
  data_table: DataTableNode as never,
  table_read: TableReadNode as never,
  aggregate:  AggregateNode as never,
  filter:     FilterNode as never,
  join_text:  JoinTextNode as never,
  sheets_write: SheetsWriteNode as never,
  text_transform: TextTransformNode as never,
  chart: ChartNode as never,
  detect: DetectNode as never,
  classifier: ClassifierNode as never,
  pose: PoseNode as never,
  object_count: ObjectCountNode as never,
  color_detect: ColorDetectNode as never,
  ocr: OcrNode as never,
  face_mesh: FaceMeshNode as never,
  face_count: FaceCountNode as never,
  smile: SmileNode as never,
  face_recognition: FaceRecognitionNode as never,
  emotion: EmotionNode as never,
  mnist: MnistNode as never,
  style_transfer: StyleTransferNode as never,
  segmentation: SegmentationNode as never,
  deep_detect: DeepDetectNode as never,
  tracking: TrackingNode as never,
  deep_classifier: DeepClassifierNode as never,
  display: DisplayNode as never,
  light_bulb: LightBulbNode as never,
  tts: TextToSpeechNode as never,
  play_sound: PlaySoundNode as never,
  // Image editing (all share one generic component)
  brightness: ImageEditNode as never,
  contrast: ImageEditNode as never,
  saturation: ImageEditNode as never,
  sharpen: ImageEditNode as never,
  grayscale: ImageEditNode as never,
  invert: ImageEditNode as never,
  blur: ImageEditNode as never,
  rgb_adjust: ImageEditNode as never,
  // Arduino — all five share one component (read/write differ visually only)
  arduino_digital_read:  ArduinoNode as never,
  arduino_analog_read:   ArduinoNode as never,
  arduino_digital_write: ArduinoNode as never,
  arduino_analog_write:  ArduinoNode as never,
  arduino_servo:         ArduinoNode as never,
  // Messaging — one component switches on type for all four LINE blocks
  line_push_text:    LineNode as never,
  line_push_image:   LineNode as never,
  line_push_sticker: LineNode as never,
  line_push_flex:    LineNode as never,
}

// In-memory clipboard for copy/paste across the canvas
let clipboard: { nodes: FlowNode[]; edges: FlowEdge[] } | null = null

type Sel = { selected?: boolean }

// Clone the given nodes (+ their internal edges) with fresh ids, offset a bit,
// and add them to the flow as the new selection. Used by paste and duplicate.
function cloneInto(srcNodes: FlowNode[], srcEdges: FlowEdge[]) {
  if (!srcNodes.length) return
  const store = useFlowStore.getState()
  const idMap = new Map<string, string>()
  const offset = 48
  const newNodes = srcNodes.map((n) => {
    const nid = nanoid()
    idMap.set(n.id, nid)
    const c = structuredClone(n)
    return { ...c, id: nid, selected: true, position: { x: (n.position?.x ?? 0) + offset, y: (n.position?.y ?? 0) + offset } }
  })
  const newEdges = srcEdges
    .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
    .map((ed) => ({ ...structuredClone(ed), id: nanoid(), source: idMap.get(ed.source)!, target: idMap.get(ed.target)!, selected: false }))
  store.setNodes([...store.nodes.map((n) => ({ ...n, selected: false })), ...newNodes] as FlowNode[])
  if (newEdges.length) store.setEdges([...store.edges, ...newEdges] as FlowEdge[])
}

function FlowCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, selectNode } =
    useFlowStore()
  const isLight = useThemeStore((s) => s.mode === 'light')
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow()

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/reactflow-type')
      const label = e.dataTransfer.getData('application/reactflow-label')
      const configStr = e.dataTransfer.getData('application/reactflow-config')

      if (!type) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      // dataTransfer can be tampered/corrupted — a bad payload shouldn't kill the canvas
      let config = {}
      try {
        config = configStr ? JSON.parse(configStr) : {}
      } catch { /* drop with empty config */ }

      addNode({
        id: nanoid(),
        type,
        position,
        data: { label, config },
      })
    },
    [screenToFlowPosition, addNode]
  )

  // ── Keyboard shortcuts (copy / paste / duplicate / undo / redo / deselect) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const inField = !!el && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
      )
      const store = useFlowStore.getState()

      if (e.key === 'Escape') {
        if (inField) return
        store.setNodes(store.nodes.map((n) => ({ ...n, selected: false })) as FlowNode[])
        selectNode(null)
        return
      }

      if (!(e.ctrlKey || e.metaKey) || inField) return
      const sel = store.nodes.filter((n) => (n as Sel).selected)
      const innerEdges = (nodes: typeof sel) => {
        const ids = new Set(nodes.map((n) => n.id))
        return store.edges.filter((ed) => ids.has(ed.source) && ids.has(ed.target))
      }

      switch (e.key.toLowerCase()) {
        case 'c':
          if (sel.length) clipboard = structuredClone({ nodes: sel, edges: innerEdges(sel) })
          break
        case 'v':
          if (clipboard) { e.preventDefault(); cloneInto(clipboard.nodes, clipboard.edges) }
          break
        case 'd':
          if (sel.length) { e.preventDefault(); cloneInto(sel, innerEdges(sel)) }
          break
        case 'a':
          e.preventDefault()
          store.setNodes(store.nodes.map((n) => ({ ...n, selected: true })) as FlowNode[])
          break
        case 'z':
          e.preventDefault()
          if (e.shiftKey) store.redo(); else store.undo()
          break
        case 'y':
          e.preventDefault(); store.redo()
          break
        case '0':
          e.preventDefault(); fitView({ padding: 0.25, duration: 200 })
          break
        case '=':
        case '+':
          e.preventDefault(); zoomIn({ duration: 150 })
          break
        case '-':
        case '_':
          e.preventDefault(); zoomOut({ duration: 150 })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectNode, zoomIn, zoomOut, fitView])

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes as never}
        edges={edges as never}
        onNodesChange={onNodesChange as never}
        onEdgesChange={onEdgesChange as never}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={() => selectNode(null)}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.5, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: isLight ? '#fafafa' : '#09090b' }}
        defaultEdgeOptions={{
          style: { stroke: 'var(--accent)', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isLight ? '#d4d4d8' : '#27272a'} />
        <Controls className="phoenix-controls" />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  )
}
