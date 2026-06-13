'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, X, Trash2, Download, FileDown, Upload, Loader2 } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { sheetsApi, apiErrorMessage } from '@/lib/api-client'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'

interface Column {
  header?: string
  field?: string
}

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Computed columns (running number / timestamp) — excluded from change detection
// so the clock alone never counts as "the value changed".
const SPECIAL_FIELDS = new Set(['#', 'no', 'index', 'ลำดับ', 'time', 'date', 'datetime', 'now', 'timestamp'])

// Minimal CSV/TSV parser: auto-detects the delimiter from the first line and
// handles quoted fields ("a,b", embedded "" quotes, newlines inside quotes).
function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!s) return []
  const head = s.slice(0, s.indexOf('\n') >= 0 ? s.indexOf('\n') : s.length)
  const delim = ([',', '\t', ';', '|'] as const)
    .map((d) => [d, head.split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0]

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '')
}

export function DataTableNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { headers?: string[]; rows?: unknown[][]; current?: unknown[]; count?: number; result?: boolean }
    | undefined

  const columns: Column[] = Array.isArray(data.config?.columns)
    ? (data.config!.columns as Column[])
    : [{ header: '' }, { header: '' }]
  const rows: unknown[][] = Array.isArray(data.config?.rows) ? (data.config!.rows as unknown[][]) : []
  const current = output?.current
  const headers = columns.map((c, i) => (c.header?.trim() || `คอลัมน์ ${i + 1}`))
  // off = manual only · trigger = on rising-edge signal · change = when a data
  // value differs from the last captured row. (migrates the old `auto` boolean)
  const captureMode = (data.config?.captureMode as string) ?? (data.config?.auto ? 'trigger' : 'off')

  const prevTrigger = useRef(false)
  const lastSig = useRef<string | null>(null)
  useEffect(() => {
    const cur = output?.current
    const appendCurrent = () => {
      const cfg = useFlowStore.getState().nodes.find((n) => n.id === id)?.data?.config
      const latest = (cfg?.rows as unknown[][]) ?? []
      updateNodeConfig(id, { rows: [...latest, [...(cur as unknown[])]] })
    }

    if (captureMode === 'trigger') {
      const fired = output?.result === true
      if (fired && !prevTrigger.current && Array.isArray(cur) && cur.length) appendCurrent()
      prevTrigger.current = fired
    } else if (captureMode === 'change' && Array.isArray(cur) && cur.length) {
      const cols = (useFlowStore.getState().nodes.find((n) => n.id === id)?.data?.config?.columns as Column[]) ?? []
      const isSpecial = (i: number) => SPECIAL_FIELDS.has((cols[i]?.field ?? '').toLowerCase().trim())
      const hasData = cur.some((v, i) => !isSpecial(i) && v != null && v !== '')
      if (hasData) {
        const sig = cur.map((v, i) => (isSpecial(i) ? '' : cellText(v))).join('␟')
        if (sig !== lastSig.current) {
          appendCurrent()
          lastSig.current = sig
        }
      }
    }
  }, [output, captureMode, id, updateNodeConfig])

  const setColumns = (next: Column[]) => updateNodeConfig(id, { columns: next })
  const setColumn = (i: number, patch: Partial<Column>) =>
    setColumns(columns.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addColumn = () => setColumns([...columns, { header: '' }])
  const removeColumn = (i: number) =>
    updateNodeConfig(id, {
      columns: columns.filter((_, j) => j !== i),
      rows: rows.map((r) => r.filter((_, j) => j !== i)),
    })

  const addRow = () => {
    const row = current && current.length ? current : columns.map(() => null)
    updateNodeConfig(id, { rows: [...rows, [...row]] })
  }
  const clearRows = () => updateNodeConfig(id, { rows: [] })
  const removeRow = (i: number) => updateNodeConfig(id, { rows: rows.filter((_, j) => j !== i) })

  // Download the whole table as a CSV file (UTF-8 BOM so Excel reads Thai)
  const exportCsv = () => {
    const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = [headers.map(esc).join(',')]
    for (const r of rows) {
      lines.push(headers.map((_, i) => esc(cellText(Array.isArray(r) ? r[i] : ''))).join(','))
    }
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url
    a.download = `${(data.label || 'table').replace(/[^\w฀-๿-]+/g, '_')}-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV import ──
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [firstHeader, setFirstHeader] = useState(true)
  const [sheetUrl, setSheetUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchSheet = async () => {
    if (!sheetUrl.trim()) return
    setFetching(true); setFetchErr('')
    try {
      const res = await sheetsApi.fetchCsv(sheetUrl.trim())
      setImportText(res.data.text)
    } catch (err) {
      setFetchErr(apiErrorMessage(err))
    } finally {
      setFetching(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => { setImportText(String(reader.result ?? '')); setImportOpen(true) }
    reader.readAsText(f, 'utf-8')
    e.target.value = ''
  }

  const doImport = (append: boolean) => {
    const parsed = parseCsv(importText)
    if (!parsed.length) return
    if (append) {
      const dataRows = firstHeader ? parsed.slice(1) : parsed
      updateNodeConfig(id, { rows: [...rows, ...dataRows] })
    } else if (firstHeader) {
      updateNodeConfig(id, {
        columns: parsed[0].map((h) => ({ header: h })),
        rows: parsed.slice(1),
      })
    } else {
      const width = Math.max(...parsed.map((r) => r.length))
      updateNodeConfig(id, {
        columns: Array.from({ length: width }, (_, i) => ({ header: `คอลัมน์ ${i + 1}` })),
        rows: parsed,
      })
    }
    setImportOpen(false)
    setImportText('')
  }

  const canAdd = columns.length > 0
  // Only the last ~80 rows are rendered to keep big tables snappy
  const shown = rows.slice(-80)
  const hiddenCount = rows.length - shown.length

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="data_table" size={16} className="text-violet-400" />}>
      <div className="w-[280px] space-y-2">
        {/* Field suggestions (special + upstream) */}
        <datalist id={`dtf-${id}`}>
          <option value="#">เลขรันนิ่ง 1,2,3…</option>
          <option value="time">เวลา</option>
          <option value="date">วันที่</option>
          <option value="datetime">วันเวลา</option>
          <option value="value1" />
          <option value="value2" />
          <option value="text" />
        </datalist>

        {/* Column editor */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-1">คอลัมน์ (หัวข้อ + ดึงจาก)</div>
          <div className="space-y-1">
            {columns.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                <TextInput
                  value={c.header ?? ''}
                  onChange={(e) => setColumn(i, { header: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={`หัวข้อ ${i + 1}`}
                  className="nodrag flex-1 min-w-0 text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
                <TextInput
                  value={c.field ?? ''}
                  onChange={(e) => setColumn(i, { field: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  list={`dtf-${id}`}
                  placeholder={`value${i + 1}`}
                  title="ดึงจากฟิลด์ไหน (ว่าง = valueN ตามลำดับ) — พิเศษ: #, time, date, datetime"
                  className="nodrag w-[64px] shrink-0 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-violet-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
                {columns.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeColumn(i) }}
                    className="nodrag shrink-0 p-1 text-zinc-600 hover:text-red-400"
                    title="ลบคอลัมน์"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); addColumn() }}
            className="nodrag mt-1 flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-300"
          >
            <Plus size={11} /> เพิ่มคอลัมน์
          </button>
        </div>

        {/* Capture controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); addRow() }}
            disabled={!canAdd}
            className="nodrag flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded"
            title="บันทึกค่าปัจจุบันจากบล็อกก่อนหน้าเป็น 1 แถว"
          >
            <Download size={12} /> บันทึกแถว
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearRows() }}
            disabled={!rows.length}
            className="nodrag p-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-400 hover:text-red-400 rounded"
            title="ล้างทุกแถว"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Auto-capture mode */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="shrink-0">บันทึกอัตโนมัติ:</span>
          <select
            value={captureMode}
            onChange={(e) => updateNodeConfig(id, { captureMode: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
          >
            <option value="off">ปิด (กดเอง)</option>
            <option value="trigger">เมื่อได้สัญญาณ True (เช่น Interval)</option>
            <option value="change">เมื่อค่าเปลี่ยน</option>
          </select>
        </div>

        {/* What "บันทึกแถว" will capture right now */}
        {Array.isArray(current) && current.length > 0 && (
          <div className="text-[10px] text-zinc-500 truncate">
            จะบันทึก: <span className="font-mono text-zinc-300">{current.map(cellText).join(' · ') || '—'}</span>
          </div>
        )}

        {/* Stored table */}
        <div className="border border-zinc-700/60 rounded overflow-hidden">
          <div className="flex items-center justify-between px-1.5 py-1 bg-zinc-800/60 text-[10px] text-zinc-400">
            <span>ตาราง</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">{rows.length} แถว</span>
              <button
                onClick={(e) => { e.stopPropagation(); setImportOpen((o) => !o) }}
                className="nodrag flex items-center gap-0.5 text-violet-400 hover:text-violet-300"
                title="นำเข้าข้อมูลจากไฟล์ CSV หรือวางข้อความ"
              >
                <Upload size={11} /> นำเข้า
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); exportCsv() }}
                disabled={!rows.length}
                className="nodrag flex items-center gap-0.5 text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed"
                title="บันทึกเป็นไฟล์ CSV (เปิดใน Excel ได้)"
              >
                <FileDown size={11} /> บันทึก
              </button>
            </div>
          </div>

          {/* CSV import panel */}
          {importOpen && (
            <div className="nodrag p-1.5 space-y-1.5 border-b border-zinc-800 bg-zinc-900/60">
              {/* Google Sheets — public link */}
              <div className="flex items-center gap-1">
                <TextInput
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="ลิงก์ Google Sheets (สาธารณะ)"
                  className="nodrag flex-1 min-w-0 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); fetchSheet() }}
                  disabled={!sheetUrl.trim() || fetching}
                  className="nodrag flex items-center gap-1 px-2 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded"
                  title="ดึงข้อมูลจาก Google Sheets"
                >
                  {fetching ? <Loader2 size={10} className="animate-spin" /> : '⇣'} ดึง
                </button>
              </div>
              {fetchErr && <div className="text-[10px] text-red-400">{fetchErr}</div>}

              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                  className="nodrag flex items-center gap-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded"
                >
                  <Upload size={11} /> เลือกไฟล์ CSV
                </button>
                <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={firstHeader}
                    onChange={(e) => setFirstHeader(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="nodrag accent-violet-500 w-3 h-3"
                  />
                  บรรทัดแรกเป็นหัวข้อ
                </label>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="hidden" />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); doImport(false) }}
                  disabled={!importText.trim()}
                  className="nodrag flex-1 py-1 text-[10px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded"
                  title="แทนที่ตารางทั้งหมดด้วยข้อมูลนี้"
                >
                  นำเข้า (แทนที่)
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); doImport(true) }}
                  disabled={!importText.trim()}
                  className="nodrag px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded"
                  title="ต่อท้ายแถวที่มีอยู่"
                >
                  ต่อท้าย
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setImportOpen(false); setImportText('') }}
                  className="nodrag px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
          <div className="max-h-[170px] overflow-auto nowheel nodrag">
            <table className="w-full text-[10px] border-collapse">
              <thead className="sticky top-0 bg-zinc-900">
                <tr>
                  <th className="px-1 py-1 text-zinc-600 font-normal w-5">#</th>
                  {headers.map((h, i) => (
                    <th key={i} className="px-1.5 py-1 text-left text-violet-300 font-medium border-b border-zinc-800 truncate max-w-[90px]">{h}</th>
                  ))}
                  <th className="w-5" />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={headers.length + 2} className="px-2 py-3 text-center text-[10px] text-zinc-600 italic">
                      ยังไม่มีข้อมูล — ต่อบล็อก (เช่น JSON) แล้วกด “บันทึกแถว”
                    </td>
                  </tr>
                ) : (
                  shown.map((r, ri) => {
                    const realIdx = hiddenCount + ri
                    return (
                      <tr key={realIdx} className="group hover:bg-zinc-800/40">
                        <td className="px-1 py-0.5 text-zinc-600 text-right">{realIdx + 1}</td>
                        {headers.map((_, ci) => (
                          <td key={ci} className="px-1.5 py-0.5 text-zinc-200 border-b border-zinc-800/50 truncate max-w-[90px]" title={cellText(r[ci])}>
                            {cellText(r[ci])}
                          </td>
                        ))}
                        <td className="px-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeRow(realIdx) }}
                            className="nodrag opacity-0 group-hover:opacity-100 p-0.5 text-zinc-600 hover:text-red-400"
                            title="ลบแถว"
                          >
                            <X size={10} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <div className="px-1.5 py-0.5 text-[9px] text-zinc-600 italic border-t border-zinc-800">แสดง 80 แถวล่าสุด (+{hiddenCount} ก่อนหน้า)</div>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
