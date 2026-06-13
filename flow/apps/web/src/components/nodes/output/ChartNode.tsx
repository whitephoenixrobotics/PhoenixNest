'use client'

import { Plus, X } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'

interface Series { column?: string; color?: string; name?: string }

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const PALETTE = ['#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#60a5fa', '#f87171']

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ChartNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { headers?: string[]; rows?: unknown[][] }
    | undefined

  const title = (data.config?.title as string) ?? ''
  const type = (data.config?.type as string) ?? 'line'
  const labelMode = (data.config?.labelMode as string) ?? 'column'
  const labelColumn = (data.config?.labelColumn as string) ?? ''
  const labelText = (data.config?.labelText as string) ?? ''
  const series: Series[] = Array.isArray(data.config?.series) && (data.config!.series as Series[]).length
    ? (data.config!.series as Series[])
    : [{ column: '', color: PALETTE[0] }]

  const headers = output?.headers ?? []
  const rows = output?.rows ?? []
  const sized = !!data.config?.resized

  // ── derive chart data ──
  const labels: string[] =
    labelMode === 'manual'
      ? labelText.split(',').map((s) => s.trim())
      : (() => {
          const li = headers.indexOf(labelColumn)
          return li >= 0 ? rows.map((r) => cellText(r[li])) : rows.map((_, i) => String(i + 1))
        })()

  const plotted = series.map((s, i) => {
    const ci = headers.indexOf(s.column ?? '')
    const vals = ci >= 0 ? rows.map((r) => Number(r[ci]) || 0) : []
    return { name: s.name?.trim() || s.column || `เส้น ${i + 1}`, color: s.color || PALETTE[i % PALETTE.length], vals }
  })

  const n = Math.max(0, ...plotted.map((p) => p.vals.length))
  const allVals = plotted.flatMap((p) => p.vals)
  let yMin = allVals.length ? Math.min(...allVals) : 0
  let yMax = allVals.length ? Math.max(...allVals) : 1
  if (yMin === yMax) { yMax = yMin + 1; yMin = yMin - 1 }

  // SVG geometry (viewBox; scales to the node via CSS)
  const W = 280, H = 150, pad = { l: 30, r: 8, t: 8, b: 18 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const xAt = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

  // config helpers
  const setSeries = (next: Series[]) => updateNodeConfig(id, { series: next })
  const setSer = (i: number, patch: Partial<Series>) => setSeries(series.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const addSeries = () => setSeries([...series, { column: '', color: PALETTE[series.length % PALETTE.length] }])
  const removeSeries = (i: number) => setSeries(series.length > 1 ? series.filter((_, j) => j !== i) : series)

  const colSelect = (value: string, onChange: (v: string) => void, placeholder: string) =>
    headers.length > 0 ? (
      <select value={value} onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()}
        className="nodrag flex-1 min-w-0 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-200 focus:outline-none focus:border-violet-500">
        {!headers.includes(value) && <option value={value}>{value || placeholder}</option>}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    ) : (
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder={placeholder}
        className="nodrag flex-1 min-w-0 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
    )

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="chart" size={16} className="text-violet-400" />} hasOutput={false} resizable fill={sized} minWidth={240} minHeight={260} onResize={() => { if (!sized) updateNodeConfig(id, { resized: true }) }}>
      <div className={sized ? 'w-full h-full flex flex-col gap-1.5' : 'w-[252px] space-y-1.5'}>
        <TextInput
          value={title}
          onChange={(e) => updateNodeConfig(id, { title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="ชื่อกราฟ"
          className="nodrag w-full text-xs font-semibold bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
        />

        {/* Chart */}
        <div className={cnChart(sized)}>
          {title && <div className="text-[11px] text-zinc-200 font-medium text-center truncate">{title}</div>}
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: sized ? undefined : 150 }}>
            {/* axes */}
            <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#3f3f46" strokeWidth={1} />
            <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#3f3f46" strokeWidth={1} />
            {/* y ticks */}
            {[yMax, (yMax + yMin) / 2, yMin].map((v, i) => (
              <g key={i}>
                <text x={pad.l - 3} y={yAt(v) + 3} textAnchor="end" fontSize={7} fill="#71717a">{fmt(v)}</text>
                <line x1={pad.l} y1={yAt(v)} x2={W - pad.r} y2={yAt(v)} stroke="#27272a" strokeWidth={0.5} />
              </g>
            ))}
            {n === 0 ? (
              <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={9} fill="#52525b">ต่อตารางข้อมูล + เปิด Auto</text>
            ) : type === 'bar' ? (
              plotted.map((p, si) => p.vals.map((v, i) => {
                const bw = Math.max(2, (innerW / Math.max(1, n)) / (plotted.length + 0.5))
                const x = xAt(i) - (plotted.length * bw) / 2 + si * bw
                return <rect key={`${si}-${i}`} x={x} y={yAt(v)} width={bw} height={Math.max(0, H - pad.b - yAt(v))} fill={p.color} opacity={0.9} />
              }))
            ) : (
              plotted.map((p, si) => (
                <g key={si}>
                  <polyline fill="none" stroke={p.color} strokeWidth={1.5}
                    points={p.vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')} />
                  {p.vals.map((v, i) => <circle key={i} cx={xAt(i)} cy={yAt(v)} r={1.6} fill={p.color} />)}
                </g>
              ))
            )}
            {/* x labels — first / middle / last */}
            {n > 0 && [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
              <text key={i} x={xAt(i)} y={H - pad.b + 9} textAnchor="middle" fontSize={7} fill="#71717a">{(labels[i] ?? '').slice(0, 8)}</text>
            ))}
          </svg>
          {/* legend */}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center">
            {plotted.map((p, i) => (
              <span key={i} className="flex items-center gap-1 text-[9px] text-zinc-400">
                <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} /> {p.name}
              </span>
            ))}
          </div>
        </div>

        {/* Config */}
        <div className="space-y-1 border-t border-zinc-700/50 pt-1">
          <div className="flex items-center gap-1">
            <select value={type} onChange={(e) => updateNodeConfig(id, { type: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="nodrag text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500">
              <option value="line">เส้น</option>
              <option value="bar">แท่ง</option>
            </select>
            <select value={labelMode} onChange={(e) => updateNodeConfig(id, { labelMode: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="nodrag text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500" title="ป้ายแกน X">
              <option value="column">ป้ายจากคอลัมน์</option>
              <option value="manual">ป้ายพิมพ์เอง</option>
            </select>
          </div>
          {labelMode === 'column'
            ? <div className="flex items-center gap-1"><span className="text-[10px] text-zinc-500 shrink-0">ป้าย X:</span>{colSelect(labelColumn, (v) => updateNodeConfig(id, { labelColumn: v }), 'คอลัมน์ป้าย')}</div>
            : <TextInput value={labelText} onChange={(e) => updateNodeConfig(id, { labelText: e.target.value })} onClick={(e) => e.stopPropagation()} placeholder="ป้าย คั่นด้วย , เช่น จ,อ,พ"
                className="nodrag w-full text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />}

          <div className="text-[10px] text-zinc-500">เส้นข้อมูล (เปรียบเทียบได้)</div>
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              {colSelect(s.column ?? '', (v) => setSer(i, { column: v }), 'คอลัมน์ค่า')}
              <input type="color" value={s.color || PALETTE[i % PALETTE.length]} onChange={(e) => setSer(i, { color: e.target.value })} onClick={(e) => e.stopPropagation()}
                className="nodrag w-6 h-6 shrink-0 bg-transparent border border-zinc-700 rounded cursor-pointer" title="สีเส้น" />
              {series.length > 1 && <button onClick={(e) => { e.stopPropagation(); removeSeries(i) }} className="nodrag shrink-0 p-1 text-zinc-600 hover:text-red-400"><X size={11} /></button>}
            </div>
          ))}
          <button onClick={(e) => { e.stopPropagation(); addSeries() }} className="nodrag flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-300">
            <Plus size={11} /> เพิ่มเส้น
          </button>
        </div>
      </div>
    </BaseNode>
  )
}

function cnChart(sized: boolean): string {
  return (sized ? 'flex-1 min-h-[120px] ' : '') + 'bg-zinc-900/40 border border-zinc-800 rounded p-1 space-y-1'
}
