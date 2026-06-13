'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, FileCheck2, Loader2, X } from 'lucide-react'
import { modelsApi, trainApi } from '@/lib/api-client'

interface TrainedModel { model_id: string; model_name: string }

interface Props {
  modelId?: string
  modelName?: string
  task?: string   // 'classify' | 'detect' — filter trained-models list
  onChange: (v: { model_id: string; model_name: string } | null) => void
}

export function ModelUpload({ modelId, modelName, task, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [trained, setTrained] = useState<TrainedModel[]>([])

  // Load models trained in TrainAI (status=done) so the user can pick one
  useEffect(() => {
    if (!task) return
    trainApi.list(task)
      .then((r) => setTrained(
        r.data
          .filter((p: { status: string; model_id?: string }) => p.status === 'done' && p.model_id)
          .map((p: { model_id: string; model_name: string }) => ({ model_id: p.model_id, model_name: p.model_name }))
      ))
      .catch(() => {})
  }, [task])

  const pick = (e: React.MouseEvent) => {
    e.stopPropagation()
    ref.current?.click()
  }

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const res = await modelsApi.upload(file)
      onChange({ model_id: res.data.model_id, model_name: res.data.filename })
    } catch (ex: unknown) {
      const ax = ex as { response?: { data?: { detail?: string } } }
      setErr(ax.response?.data?.detail ?? 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="space-y-1">
      <input ref={ref} type="file" accept=".pt,.onnx" onChange={handle} className="hidden" />
      {modelId ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-800 border border-emerald-600/40 rounded-md">
          <FileCheck2 size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-zinc-200 truncate flex-1">{modelName || 'model'}</span>
          <button onClick={pick} className="nodrag text-[10px] text-zinc-400 hover:text-violet-300" title="เปลี่ยนไฟล์">
            เปลี่ยน
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="nodrag text-zinc-500 hover:text-red-400"
            title="ลบโมเดล"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <button
            onClick={pick}
            disabled={busy}
            className="nodrag w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-zinc-700 hover:border-violet-500 rounded-md text-zinc-500 hover:text-violet-400 text-[11px] transition-colors disabled:opacity-60"
          >
            {busy ? (
              <><Loader2 size={14} className="animate-spin" /> กำลังอัปโหลด...</>
            ) : (
              <><Upload size={14} /> อัปโหลดโมเดล (.pt/.onnx)</>
            )}
          </button>
          {trained.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const m = trained.find((t) => t.model_id === e.target.value)
                if (m) onChange(m)
              }}
              className="nodrag w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-[11px] text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              <option value="">— หรือเลือกโมเดลที่เทรนไว้ —</option>
              {trained.map((t) => (
                <option key={t.model_id} value={t.model_id}>{t.model_name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {err && <div className="text-[10px] text-red-400">{err}</div>}
    </div>
  )
}
