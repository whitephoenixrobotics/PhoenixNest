'use client'

import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { RotateCcw, Trash2, Spline, SquareDashed } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { ModelUpload } from './ModelUpload'

interface Region {
  id: string; kind: 'line' | 'zone'
  x1?: number; y1?: number; x2?: number; y2?: number   // line
  x?: number; y?: number; w?: number; h?: number       // zone
}
interface RegionOut { id: string; kind: string; in?: number; out?: number; inside?: number; total?: number }

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// Regions from config, migrating an old single line/zone if present
function readRegions(config: Record<string, unknown>): Region[] {
  const r = config.regions
  if (Array.isArray(r)) return r as Region[]
  if (config.mode === 'zone') {
    const z = (config.zone as Partial<Region>) ?? { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }
    return [{ ...z, id: 'r0', kind: 'zone' }]
  }
  const l = (config.line as Partial<Region>) ?? { x1: 0.2, y1: 0.5, x2: 0.8, y2: 0.5 }
  return [{ ...l, id: 'r0', kind: 'line' }]
}

export function TrackingNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string; regions?: RegionOut[]; rate_per_min?: number; max_speed?: number }
    | undefined

  const regions = readRegions(data.config)
  const modelId = data.config?.model_id as string | undefined
  const modelName = data.config?.model_name as string | undefined
  const width = (data.config?.w as number) ?? 320

  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ nx: number; ny: number } | null>(null)
  const [tool, setTool] = useState<'line' | 'zone' | null>(null)
  const [preview, setPreview] = useState<Region | null>(null)
  const [aspect, setAspect] = useState(16 / 9)

  const counts: Record<string, RegionOut> = {}
  for (const r of output?.regions ?? []) counts[r.id] = r

  const setRegions = (next: Region[]) => updateNodeConfig(id, { regions: next })
  const addRegion = (rg: Region) => setRegions([...regions, rg])
  const delRegion = (rid: string) => setRegions(regions.filter((r) => r.id !== rid))

  const toNorm = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    return { nx: clamp01((e.clientX - r.left) / r.width), ny: clamp01((e.clientY - r.top) / r.height) }
  }
  const onDown = (e: React.PointerEvent) => {
    if (!tool) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = toNorm(e)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !tool) return
    const p = toNorm(e)
    setPreview(tool === 'zone'
      ? { id: '_', kind: 'zone', x: Math.min(drag.current.nx, p.nx), y: Math.min(drag.current.ny, p.ny), w: Math.abs(p.nx - drag.current.nx), h: Math.abs(p.ny - drag.current.ny) }
      : { id: '_', kind: 'line', x1: drag.current.nx, y1: drag.current.ny, x2: p.nx, y2: p.ny })
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || !tool) return
    const p = toNorm(e)
    if (tool === 'zone') {
      const z = { x: Math.min(drag.current.nx, p.nx), y: Math.min(drag.current.ny, p.ny), w: Math.abs(p.nx - drag.current.nx), h: Math.abs(p.ny - drag.current.ny) }
      if (z.w > 0.03 && z.h > 0.03) addRegion({ id: nanoid(6), kind: 'zone', ...z })
    } else {
      const l = { x1: drag.current.nx, y1: drag.current.ny, x2: p.nx, y2: p.ny }
      if (Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 0.03) addRegion({ id: nanoid(6), kind: 'line', ...l })
    }
    drag.current = null
    setPreview(null)
  }

  const reset = (e: React.MouseEvent) => { e.stopPropagation(); updateNodeConfig(id, { reset: Number(data.config?.reset ?? 0) + 1 }) }
  const setWidth = (w: number) => updateNodeConfig(id, { w: Math.max(240, Math.min(820, w)) })

  const drawn = preview ? [...regions, preview] : regions
  const lineCount = regions.filter((r) => r.kind === 'line').length
  const zoneCount = regions.filter((r) => r.kind === 'zone').length

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="tracking" size={16} className="text-violet-400" />}>
      <div className="space-y-2" style={{ width }}>
        {/* Tools */}
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setTool(tool === 'line' ? null : 'line') }}
            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] border ${tool === 'line' ? 'border-violet-400 bg-violet-500/20 text-violet-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
            <Spline size={12} /> + เส้นนับ
          </button>
          <button onClick={(e) => { e.stopPropagation(); setTool(tool === 'zone' ? null : 'zone') }}
            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] border ${tool === 'zone' ? 'border-violet-400 bg-violet-500/20 text-violet-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
            <SquareDashed size={12} /> + กรอบ
          </button>
          <button onClick={(e) => { e.stopPropagation(); setWidth(width - 120) }} title="ย่อ" className="nodrag px-2 py-1 rounded text-[11px] border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200">−</button>
          <button onClick={(e) => { e.stopPropagation(); setWidth(width + 120) }} title="ขยาย" className="nodrag px-2 py-1 rounded text-[11px] border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200">+</button>
        </div>

        {/* Canvas */}
        <div
          ref={boxRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          style={{ aspectRatio: String(aspect) }}
          className={'nodrag relative w-full bg-zinc-950 rounded-md border border-zinc-700 overflow-hidden select-none ' + (tool ? 'cursor-crosshair' : 'cursor-default')}
        >
          {output?.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={output.image} alt="track" onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight) }}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 text-center px-2 pointer-events-none">
              {tool ? `ลากวาด${tool === 'zone' ? 'กรอบ' : 'เส้น'}บนภาพ` : 'กด + เส้นนับ / + กรอบ แล้วลากบนภาพ'}
            </div>
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
            {drawn.map((r) => r.kind === 'zone' ? (
              <rect key={r.id} x={(r.x ?? 0) * 100} y={(r.y ?? 0) * 100} width={(r.w ?? 0) * 100} height={(r.h ?? 0) * 100}
                fill="rgba(168,85,247,0.13)" stroke="#a855f7" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ) : (
              <g key={r.id}>
                <line x1={(r.x1 ?? 0) * 100} y1={(r.y1 ?? 0) * 100} x2={(r.x2 ?? 0) * 100} y2={(r.y2 ?? 0) * 100} stroke="#a855f7" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <circle cx={(r.x1 ?? 0) * 100} cy={(r.y1 ?? 0) * 100} r={2} fill="#a855f7" vectorEffect="non-scaling-stroke" />
                <circle cx={(r.x2 ?? 0) * 100} cy={(r.y2 ?? 0) * 100} r={2} fill="#a855f7" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        </div>

        {/* Region list with per-region counts */}
        {regions.length === 0 ? (
          <div className="text-[10px] text-zinc-600 text-center">ยังไม่มีเส้น/กรอบ — เพิ่มแล้วลากบนภาพ</div>
        ) : (
          <div className="space-y-1 max-h-[120px] overflow-y-auto nowheel">
            {regions.map((r, i) => {
              const c = counts[r.id]
              const isLine = r.kind === 'line'
              const lineNo = regions.slice(0, i + 1).filter((x) => x.kind === 'line').length
              const zoneNo = regions.slice(0, i + 1).filter((x) => x.kind === 'zone').length
              return (
                <div key={r.id} className="flex items-center gap-1.5 text-[11px] bg-zinc-800/60 rounded px-1.5 py-1">
                  {isLine ? <Spline size={11} className="text-violet-300 shrink-0" /> : <SquareDashed size={11} className="text-violet-300 shrink-0" />}
                  <span className="text-zinc-300 shrink-0">{isLine ? `เส้น ${lineNo}` : `กรอบ ${zoneNo}`}</span>
                  <span className="flex-1 text-right font-mono text-emerald-300">
                    {isLine ? `เข้า ${c?.in ?? 0} · ออก ${c?.out ?? 0}` : `ในพื้นที่ ${c?.inside ?? 0} · รวม ${c?.total ?? 0}`}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); delRegion(r.id) }} className="nodrag p-0.5 text-zinc-600 hover:text-red-400" title="ลบ"><Trash2 size={11} /></button>
                </div>
              )
            })}
          </div>
        )}

        {/* Throughput + reset */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 text-[11px] text-zinc-400">
            อัตราการไหล <span className="font-mono text-emerald-300">{output?.rate_per_min ?? 0}</span>/นาที
            {(output?.max_speed ?? 0) > 0 && <span className="text-zinc-600"> · เร็วสุด {output?.max_speed} px/s</span>}
          </div>
          <button onClick={reset} className="nodrag px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200" title="รีเซ็ตตัวนับทั้งหมด"><RotateCcw size={12} /></button>
        </div>
        <div className="text-[9px] text-zinc-600">{lineCount} เส้น · {zoneCount} กรอบ · ตั้งค่าโมเดล/ความละเอียด/เตือน ใน Configure Node (คลิกบล็อก)</div>

        <details className="nodrag" onClick={(e) => e.stopPropagation()}>
          <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300">โมเดลของคุณเอง (ไม่บังคับ)</summary>
          <div className="pt-1.5">
            <ModelUpload modelId={modelId} modelName={modelName} task="detect"
              onChange={(v) => updateNodeConfig(id, { model_id: v?.model_id ?? '', model_name: v?.model_name ?? '' })} />
            <div className="text-[9px] text-zinc-600 mt-1">ว่าง = ใช้โมเดลในตัว (รถ/คน/สัตว์ ฯลฯ)</div>
          </div>
        </details>
      </div>
    </BaseNode>
  )
}
