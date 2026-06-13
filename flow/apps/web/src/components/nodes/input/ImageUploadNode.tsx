'use client'

import { useRef, useState } from 'react'
import { Upload, X, Play, Square, Loader2 } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useNativeStore } from '@/stores/nativeStore'
import { nativeApi, apiErrorMessage } from '@/lib/api-client'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function ImageUploadNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const start = useNativeStore((s) => s.start)
  const stop = useNativeStore((s) => s.stop)
  const running = useNativeStore((s) => s.running && s.sourceId === id)
  const progress = useNativeStore((s) => (s.sourceId === id ? s.progress : null))
  const fps = useNativeStore((s) => (s.sourceId === id ? s.fps : 0))
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const image = data.config?.image as string | undefined
  const filename = data.config?.filename as string | undefined
  const mime = (data.config?.mime as string) || ''
  const videoId = data.config?.video_id as string | undefined
  const isVideo = !!videoId || mime.startsWith('video/')
  const speed = (data.config?.speed as number) ?? 1   // playback rate (every frame still processed)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')

    if (file.type.startsWith('video/')) {
      // Upload the clip to the backend — it decodes + runs every frame itself
      setBusy(true)
      try {
        const res = await nativeApi.uploadVideo(file)
        updateNodeConfig(id, { image: '', video_id: res.data.file_id, filename: file.name, mime: file.type })
      } catch (e2) {
        setErr(apiErrorMessage(e2))
      } finally {
        setBusy(false)
        // Always clear the input so re-selecting the same file fires onChange
        if (fileRef.current) fileRef.current.value = ''
      }
      return
    }

    // Image — read into the config as a data URL (one-shot, unchanged)
    const reader = new FileReader()
    reader.onload = () => updateNodeConfig(id, { image: reader.result as string, video_id: '', filename: file.name, mime: file.type })
    reader.readAsDataURL(file)
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (running) stop()
    if (videoId) nativeApi.deleteVideo(videoId).catch(() => {})
    updateNodeConfig(id, { image: '', video_id: '', filename: '', mime: '' })
    if (fileRef.current) fileRef.current.value = ''
  }

  const pickFile = (e: React.MouseEvent) => { e.stopPropagation(); fileRef.current?.click() }

  const process = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (running) { stop(); return }
    if (videoId) start(id, { type: 'video', file_id: videoId, speed })
  }

  const pct = progress && progress.total ? Math.round((progress.frame / progress.total) * 100) : 0

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="image_upload" size={16} className="text-violet-400" />} hasInput={false}>
      <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />

      {isVideo ? (
        /* Video — uploaded to backend; processed there frame-by-frame. Results show on downstream blocks. */
        <div className="nodrag w-[210px] space-y-1.5">
          <div className="flex items-center gap-2 bg-zinc-800/60 rounded-md px-2 py-2">
            <span className="text-lg">🎬</span>
            <span className="flex-1 text-[11px] text-zinc-300 truncate">{filename || 'วิดีโอ'}</span>
            <button onClick={clearAll} className="p-1 text-zinc-500 hover:text-red-400" title="ลบวิดีโอ"><X size={13} /></button>
          </div>
          {/* Playback speed — every frame is still processed (accurate); this
              just paces how fast results stream so you can watch slow/fast */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 shrink-0">ความเร็ว</span>
            {[0.25, 0.5, 1, 1.5, 2].map((s) => (
              <button key={s} disabled={running}
                onClick={(e) => { e.stopPropagation(); updateNodeConfig(id, { speed: s }) }}
                className={`nodrag flex-1 py-0.5 rounded text-[10px] border disabled:opacity-50 ${speed === s ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                {s}x
              </button>
            ))}
          </div>
          <button
            onClick={process}
            className={'w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ' +
              (running ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white')}
          >
            {running ? <><Square size={11} /> หยุด {fps ? `· ${fps} FPS` : ''}</> : <><Play size={11} /> ประมวลผล</>}
          </button>
          {running && (
            <div className="space-y-0.5">
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
              {progress && <div className="text-[10px] text-zinc-500 text-right tabular-nums">{progress.frame}/{progress.total} เฟรม</div>}
            </div>
          )}
          <div className="text-[9px] text-zinc-600">ประมวลผลทุกเฟรมบนเครื่อง (GPU) — ดูผลที่บล็อกถัดไป</div>
        </div>
      ) : image ? (
        /* Static image (one-shot) */
        <div className="nodrag relative w-[200px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={filename || 'uploaded'} className="w-full h-[120px] object-cover rounded-md border border-zinc-700" />
          <button onClick={clearAll} className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 rounded-md text-white" title="ลบ"><X size={12} /></button>
          {filename && <div className="mt-1 text-[10px] text-zinc-500 truncate">{filename}</div>}
        </div>
      ) : (
        <button
          onClick={busy ? undefined : pickFile}
          className="nodrag w-[200px] h-[100px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-violet-500 rounded-md text-zinc-500 hover:text-violet-400 transition-colors"
        >
          {busy ? <><Loader2 size={18} className="animate-spin" /><span className="text-xs">กำลังอัปโหลด...</span></>
                : <><Upload size={20} /><span className="text-xs">คลิกเพื่ออัปโหลดภาพ / วิดีโอ</span></>}
        </button>
      )}
      {err && <div className="text-[10px] text-red-400 mt-1 w-[200px]">{err}</div>}
    </BaseNode>
  )
}
