'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, X, Video, VideoOff, Radio, Square, FlipHorizontal2 } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { webcamRegistry } from '@/stores/webcamRegistry'
import { useNativeStore } from '@/stores/nativeStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function WebcamCaptureNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const startNative = useNativeStore((s) => s.start)
  const stopNative = useNativeStore((s) => s.stop)
  const running = useNativeStore((s) => s.running && s.sourceId === id)
  const fps = useNativeStore((s) => (s.sourceId === id ? s.fps : 0))
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')

  const image = data.config?.image as string | undefined
  const camIndex = (data.config?.cam_index as number) ?? 0
  const mirror = !!data.config?.mirror

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()) }, [stream])

  // While the browser preview is open, expose frames for snapshot + the
  // "grab from webcam" feature (Classifier / Face). Native processing uses the
  // backend camera instead, so this only matters during preview.
  useEffect(() => {
    if (!stream) { webcamRegistry.unregister(id); return }
    const canvas = document.createElement('canvas')
    const getFrame = (): string | null => {
      const v = videoRef.current
      if (!v || v.videoWidth === 0) return null
      if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth
      if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? canvas.width : 0, 0)
      ctx.drawImage(v, 0, 0)
      return canvas.toDataURL('image/jpeg', 0.6)
    }
    webcamRegistry.register(id, getFrame)
    return () => webcamRegistry.unregister(id)
  }, [stream, id, mirror])

  const releaseStream = () => { stream?.getTracks().forEach((t) => t.stop()); setStream(null) }

  const startCamera = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true }))
    } catch {
      setError('ไม่สามารถเข้าถึงกล้องได้')
    }
  }

  const stopCamera = (e: React.MouseEvent) => { e.stopPropagation(); releaseStream() }

  const capture = (e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0)
    updateNodeConfig(id, { image: canvas.toDataURL('image/png'), mime: 'image/png' })
    releaseStream()
  }

  const retake = (e: React.MouseEvent) => { e.stopPropagation(); updateNodeConfig(id, { image: '', mime: '' }) }

  // Backend opens the camera itself and runs every frame (no per-frame upload).
  // Release the browser stream first so the OS hands the camera to the backend.
  const process = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (running) { stopNative(); return }
    releaseStream()
    setTimeout(() => startNative(id, { type: 'webcam', index: camIndex, mirror }), 300)
  }

  const toggleMirror = (e: React.MouseEvent) => { e.stopPropagation(); updateNodeConfig(id, { mirror: !mirror }) }

  const idxSelect = (
    <select
      value={camIndex}
      onChange={(e) => updateNodeConfig(id, { cam_index: Number(e.target.value) })}
      onClick={(e) => e.stopPropagation()}
      className="nodrag text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
      title="เลือกกล้อง (ถ้ามีหลายตัว)"
    >
      {[0, 1, 2, 3].map((i) => <option key={i} value={i}>กล้อง {i}</option>)}
    </select>
  )

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="webcam_capture" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="nodrag w-[220px] space-y-2">
        {error && <div className="text-[10px] text-red-400">{error}</div>}

        {running ? (
          /* Backend owns the camera and runs every frame — result shows downstream */
          <>
            <div className="h-[120px] flex flex-col items-center justify-center gap-1 bg-zinc-900 border border-red-500 rounded-md">
              <span className="flex items-center gap-1.5 text-red-400 text-xs"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> ประมวลผลสด {fps ? `· ${fps} FPS` : ''}</span>
              <span className="text-[10px] text-zinc-500">กล้อง {camIndex} · ดูผลที่บล็อกถัดไป</span>
            </div>
            <button onClick={process} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md">
              <Square size={12} /> หยุด
            </button>
          </>
        ) : image ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="captured" className="w-full h-[140px] object-cover rounded-md border border-zinc-700" />
            <button onClick={retake} className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 rounded-md text-white" title="ถ่ายใหม่"><X size={12} /></button>
          </div>
        ) : stream ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted style={{ transform: mirror ? 'scaleX(-1)' : 'none' }} className="w-full h-[140px] object-cover rounded-md bg-black border border-violet-500" />
            <div className="flex gap-1.5">
              <button onClick={capture} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-md"><Camera size={12} /> ถ่ายภาพ</button>
              <button onClick={process} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-md"><Radio size={12} /> ประมวลผล</button>
              <button onClick={toggleMirror} title="กระจก (mirror)" className={'p-1.5 rounded-md border ' + (mirror ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200')}><FlipHorizontal2 size={12} /></button>
              <button onClick={stopCamera} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md" title="ปิดกล้อง"><VideoOff size={12} /></button>
            </div>
          </>
        ) : (
          <>
            <button onClick={startCamera} className="w-full h-[90px] flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-zinc-700 hover:border-violet-500 rounded-md text-zinc-500 hover:text-violet-400 transition-colors">
              <Video size={20} />
              <span className="text-xs">เปิดกล้องดูภาพ / ถ่ายภาพ</span>
            </button>
            <div className="flex items-center gap-1.5">
              {idxSelect}
              <button onClick={toggleMirror} title="กระจก (mirror)" className={'p-1.5 rounded-md border ' + (mirror ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200')}><FlipHorizontal2 size={13} /></button>
              <button onClick={process} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-md"><Radio size={12} /> ประมวลผลสด</button>
            </div>
          </>
        )}
      </div>
    </BaseNode>
  )
}
