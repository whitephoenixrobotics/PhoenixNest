'use client'

import { useState } from 'react'
import { CloudUpload, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'
import { TextInput } from '@/components/ui/StableField'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const APPS_SCRIPT = `function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  if (data.mode === 'replace') {
    sheet.clear();
    if (data.headers && data.headers.length) sheet.appendRow(data.headers);
  }
  (data.rows || []).forEach(function (r) { sheet.appendRow(r); });
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`

export function SheetsWriteNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { text?: string; ok?: boolean; error?: string }
    | undefined

  const url = (data.config?.url as string) ?? ''
  const mode = (data.config?.mode as string) ?? 'replace'
  const auto = !!data.config?.auto
  const status = output?.error || output?.text
  const ok = output?.ok === true

  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState(false)

  const send = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { send_token: Number(data.config?.send_token ?? 0) + 1 })
  }
  const copyScript = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(APPS_SCRIPT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="sheets_write" size={16} className="text-violet-400" />}>
      <div className="w-[238px] space-y-1.5">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">ลิงก์ Web App (Apps Script)</div>
          <TextInput
            value={url}
            onChange={(e) => updateNodeConfig(id, { url: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="nodrag w-full text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={mode}
            onChange={(e) => updateNodeConfig(id, { mode: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            <option value="replace">แทนที่ทั้งชีต (มิเรอร์ตาราง)</option>
            <option value="append">ต่อท้ายลงชีต</option>
          </select>
        </div>

        <label className="nodrag flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => updateNodeConfig(id, { auto: e.target.checked })}
            className="nodrag accent-violet-500 w-3 h-3"
          />
          ส่งอัตโนมัติเมื่อได้สัญญาณ True (เช่น Interval)
        </label>

        <button
          onClick={send}
          className="nodrag w-full flex items-center justify-center gap-1 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <CloudUpload size={12} /> ส่งขึ้น Sheet
        </button>

        {status && (
          <div className={cn('text-[10px] break-words', ok ? 'text-emerald-400' : output?.error ? 'text-red-400' : 'text-zinc-400')}>
            {status}
          </div>
        )}

        {/* Setup help */}
        <button
          onClick={(e) => { e.stopPropagation(); setHelp((h) => !h) }}
          className="nodrag w-full flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {help ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          วิธีตั้งค่า (ครั้งเดียว)
        </button>
        {help && (
          <div className="nodrag space-y-1 text-[10px] text-zinc-400 leading-relaxed">
            <div>1. เปิดชีต → เมนู <b>Extensions → Apps Script</b></div>
            <div className="flex items-center justify-between">
              <span>2. วางสคริปต์นี้:</span>
              <button onClick={copyScript} className="nodrag flex items-center gap-0.5 text-violet-400 hover:text-violet-300">
                {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
            <pre className="bg-zinc-950/70 border border-zinc-800 rounded p-1.5 overflow-auto max-h-[110px] text-[9px] text-zinc-300 nowheel">{APPS_SCRIPT}</pre>
            <div>3. <b>Deploy → New deployment → Web app</b> → Who has access: <b>Anyone</b></div>
            <div>4. ก๊อป URL ที่ได้มาวางช่องด้านบน</div>
          </div>
        )}
      </div>
    </BaseNode>
  )
}
