'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X, Loader2 } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'
import { sttApi } from '@/lib/api-client'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

type Mode = 'batch' | 'live'

// Speech-to-text via the backend (faster-whisper, offline). Works in both the
// browser and the Electron desktop app (Electron has no Web Speech API).
//   batch — record fully, then transcribe once (most accurate)
//   live  — re-transcribe the growing recording every ~2.5s (near-live)
export function SpeechToTextNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const lang = (data.config?.lang as string) ?? 'th-TH'
  const transcript = (data.config?.transcript as string) ?? ''
  const mode = ((data.config?.mode as Mode) ?? 'live')
  const whisperModel = (data.config?.whisperModel as string) ?? 'small'

  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false) // transcribing
  const [interim, setInterim] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveInFlightRef = useRef(false)
  const mimeRef = useRef('audio/webm')

  const setMode = (m: Mode) => updateNodeConfig(id, { mode: m })
  const setWhisperModel = (m: string) => updateNodeConfig(id, { whisperModel: m })

  const cleanup = () => {
    if (liveTimerRef.current) {
      clearInterval(liveTimerRef.current)
      liveTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  const transcribeBlob = async (blob: Blob): Promise<string> => {
    const res = await sttApi.transcribe(blob, lang, whisperModel, 'audio.webm')
    return (res.data?.text ?? '').trim()
  }

  const start = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (recording || busy) return
    setInterim('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      mimeRef.current = mime || 'audio/webm'
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      mr.onstop = async () => {
        cleanup()
        const chunks = chunksRef.current
        if (chunks.length === 0) {
          setInterim('')
          return
        }
        const blob = new Blob(chunks, { type: mimeRef.current })
        setBusy(true)
        setInterim('')
        try {
          const text = await transcribeBlob(blob)
          if (text) {
            const next = (transcript ? transcript + ' ' : '') + text
            updateNodeConfig(id, { transcript: next })
          }
        } catch {
          setInterim('⚠️ ถอดเสียงไม่สำเร็จ')
        } finally {
          setBusy(false)
        }
      }

      // live mode emits chunks periodically so we can transcribe the growing buffer
      mr.start(mode === 'live' ? 1000 : undefined)
      setRecording(true)

      if (mode === 'live') {
        liveTimerRef.current = setInterval(async () => {
          if (liveInFlightRef.current || chunksRef.current.length === 0) return
          liveInFlightRef.current = true
          try {
            const blob = new Blob(chunksRef.current, { type: mimeRef.current })
            const text = await transcribeBlob(blob)
            setInterim(text)
          } catch {
            /* keep last interim */
          } finally {
            liveInFlightRef.current = false
          }
        }, 2500)
      }
    } catch {
      cleanup()
      setInterim('⚠️ เปิดไมโครโฟนไม่ได้')
    }
  }

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!recording) return
    setRecording(false)
    if (liveTimerRef.current) {
      clearInterval(liveTimerRef.current)
      liveTimerRef.current = null
    }
    recorderRef.current?.stop() // triggers onstop → final transcription
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeConfig(id, { transcript: '' })
    setInterim('')
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch {
          /* ignore */
        }
      }
      cleanup()
    }
  }, [])

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      icon={<BlockIcon type="speech_to_text" size={16} className="text-violet-400" />}
      hasInput={false}
    >
      <div className="w-[220px] space-y-1.5">
        {/* Mode toggle */}
        <div className="nodrag flex gap-1 text-[10px]">
          <button
            onClick={(e) => { e.stopPropagation(); setMode('live') }}
            disabled={recording || busy}
            className={cn(
              'flex-1 py-1 rounded-md transition-colors disabled:opacity-50',
              mode === 'live' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            ถอดสด
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMode('batch') }}
            disabled={recording || busy}
            className={cn(
              'flex-1 py-1 rounded-md transition-colors disabled:opacity-50',
              mode === 'batch' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            อัดแล้วถอด
          </button>
        </div>

        {/* Accuracy ↔ speed (whisper model size) */}
        <select
          value={whisperModel}
          onChange={(e) => { e.stopPropagation(); setWhisperModel(e.target.value) }}
          onClick={(e) => e.stopPropagation()}
          disabled={recording || busy}
          className="nodrag w-full bg-zinc-800 text-zinc-300 text-[10px] rounded-md px-1.5 py-1 border border-zinc-700 focus:border-violet-500 focus:outline-none disabled:opacity-50"
        >
          <option value="base">เร็ว (base)</option>
          <option value="small">สมดุล (small)</option>
          <option value="medium">แม่น (medium)</option>
          <option value="large-v3">แม่นสุด (large-v3)</option>
        </select>

        {/* Mic toggle */}
        <button
          onClick={recording ? stop : start}
          disabled={busy}
          className={cn(
            'nodrag w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60',
            recording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
          )}
        >
          {busy ? (
            <><Loader2 size={12} className="animate-spin" /> กำลังถอด...</>
          ) : recording ? (
            <><Square size={11} /> หยุด {mode === 'live' && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}</>
          ) : (
            <><Mic size={12} /> {mode === 'live' ? 'เริ่มพูด' : 'เริ่มอัด'}</>
          )}
        </button>

        {/* Transcript */}
        <div className="relative bg-zinc-800 rounded-md p-1.5 min-h-[60px] max-h-[100px] overflow-auto scrollbar-themed">
          <p className="text-xs text-zinc-200 break-words">
            {transcript || <span className="text-zinc-600 italic">ข้อความที่ได้ยินจะแสดงที่นี่...</span>}
            {interim && <span className="text-zinc-500 italic"> {interim}</span>}
          </p>
          {transcript && (
            <button
              onClick={clear}
              className="nodrag absolute top-1 right-1 p-0.5 bg-zinc-700/60 hover:bg-red-500/60 rounded text-zinc-400 hover:text-white"
              title="ล้าง"
            >
              <X size={9} />
            </button>
          )}
        </div>

        <div className="text-[10px] text-zinc-500 text-right font-mono">{lang}</div>
      </div>
    </BaseNode>
  )
}
