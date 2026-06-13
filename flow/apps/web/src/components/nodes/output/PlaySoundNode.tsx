'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Upload, Play, Pause, Trash2, Volume2, VolumeX } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const MAX_FILE = 5 * 1024 * 1024 // 5MB — config is saved into the flow definition

export function PlaySoundNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { trigger?: boolean }
    | undefined

  const audio = (data.config?.audio as string) ?? ''
  const audioName = (data.config?.audioName as string) ?? ''
  const volume = (data.config?.volume as number) ?? 1

  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const prevTrigRef = useRef(false)
  // Latest clip/volume readable inside the trigger effect without re-firing it
  const cfgRef = useRef({ audio, volume })
  useEffect(() => { cfgRef.current = { audio, volume } })

  const play = () => {
    const cfg = cfgRef.current
    if (!cfg.audio) return
    audioElRef.current?.pause() // retrigger restarts the clip
    const el = new Audio(cfg.audio)
    el.volume = Math.max(0, Math.min(1, cfg.volume))
    el.onended = () => setPlaying(false)
    el.onerror = () => setPlaying(false)
    audioElRef.current = el
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  const stopPlay = () => {
    audioElRef.current?.pause()
    setPlaying(false)
  }

  // Play on the False→True edge of the trigger (same pattern as TTS)
  const trigger = output?.trigger === true
  useEffect(() => {
    const was = prevTrigRef.current
    prevTrigRef.current = trigger
    if (trigger && !was) play()
  }, [trigger])

  // Unmount: stop playback + release the mic
  useEffect(() => () => {
    audioElRef.current?.pause()
    recRef.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  const startRec = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            updateNodeConfig(id, { audio: reader.result, audioName: '🎙️ เสียงที่อัด' })
          }
        }
        reader.readAsDataURL(blob)
        setRecording(false)
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      alert('เปิดไมโครโฟนไม่ได้ — ตรวจสอบสิทธิ์การใช้ไมค์')
    }
  }

  const stopRec = (e: React.MouseEvent) => {
    e.stopPropagation()
    recRef.current?.stop()
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE) {
      alert('ไฟล์ใหญ่เกิน 5MB — ใช้คลิปสั้นๆ จะดีกว่า')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateNodeConfig(id, { audio: reader.result, audioName: f.name })
      }
    }
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  const removeAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    stopPlay()
    updateNodeConfig(id, { audio: '', audioName: '' })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="play_sound" size={16} className="text-violet-400" />} hasOutput={false}>
      <div className="w-[210px] space-y-1.5">
        {/* Source: record or upload */}
        <div className="flex gap-1.5">
          {recording ? (
            <button
              onClick={stopRec}
              className="nodrag flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded animate-pulse"
            >
              <Square size={11} /> หยุดอัด
            </button>
          ) : (
            <button
              onClick={startRec}
              className="nodrag flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded"
            >
              <Mic size={11} /> อัดเสียง
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
            className="nodrag flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded"
          >
            <Upload size={11} /> อัพโหลด
          </button>
          <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="hidden" />
        </div>

        {/* Current clip */}
        {audio ? (
          <div className="flex items-center gap-1.5 bg-zinc-800/60 rounded px-1.5 py-1">
            <button
              onClick={(e) => { e.stopPropagation(); if (playing) stopPlay(); else play() }}
              className="nodrag p-1 bg-violet-600 hover:bg-violet-500 text-white rounded"
              title={playing ? 'หยุด' : 'ลองฟัง'}
            >
              {playing ? <Pause size={10} /> : <Play size={10} />}
            </button>
            <span className="flex-1 text-[10px] text-zinc-300 truncate">{audioName || 'คลิปเสียง'}</span>
            <button
              onClick={removeAudio}
              className="nodrag p-1 text-zinc-600 hover:text-red-400"
              title="ลบเสียง"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ) : (
          <div className="text-[10px] text-zinc-600 italic text-center py-1">
            ยังไม่มีเสียง — อัดหรืออัพโหลดก่อน
          </div>
        )}

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          {volume > 0 ? <Volume2 size={11} className="text-zinc-500 shrink-0" /> : <VolumeX size={11} className="text-zinc-600 shrink-0" />}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => updateNodeConfig(id, { volume: Number(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 accent-violet-500 cursor-pointer"
            title="ระดับเสียง"
          />
          <span className="text-[10px] text-zinc-500 font-mono w-7 text-right">{Math.round(volume * 100)}%</span>
        </div>

        {/* Status */}
        <div className={
          'text-center text-[11px] font-mono rounded py-1 ' +
          (playing ? 'bg-emerald-600/20 text-emerald-300'
            : trigger ? 'bg-violet-600/20 text-violet-200'
            : 'bg-zinc-800 text-zinc-500')
        }>
          {playing ? '🔊 กำลังเล่น' : trigger ? 'พร้อม (True)' : 'รอ True เพื่อเล่น'}
        </div>
      </div>
    </BaseNode>
  )
}
