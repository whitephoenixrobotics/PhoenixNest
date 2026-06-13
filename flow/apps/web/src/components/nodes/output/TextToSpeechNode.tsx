'use client'

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Play } from 'lucide-react'
import { Handle, Position } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { TextArea } from '@/components/ui/StableField'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function TextToSpeechNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { should_speak?: boolean; text?: string; trigger?: boolean }
    | undefined

  const configText = (data.config?.text as string) ?? ''
  const lang  = (data.config?.lang as string) ?? 'th-TH'
  const rate  = (data.config?.rate as number) ?? 1
  const pitch = (data.config?.pitch as number) ?? 1

  // Use backend's resolved text (it picks config.text or falls back to upstream)
  const text = (output?.text as string) ?? configText
  const trigger = output?.trigger === true
  const [speaking, setSpeaking] = useState(false)

  // Edge-trigger refs (non-reactive — avoid re-running effect)
  const prevTriggerRef    = useRef(false)
  const lastSpokeAtRef    = useRef(0)
  const speakingRef       = useRef(false)
  // Always-current ref for latest config values (read inside the trigger
  // effect / speak() without re-firing on every config change)
  const cfgRef = useRef({ text, lang, rate, pitch })
  useEffect(() => {
    cfgRef.current = { text, lang, rate, pitch }
  })

  // Shared speak routine — used by both the True-trigger and the preview button
  const speak = (opts?: { force?: boolean }) => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    if (!synth) return

    const cfg = cfgRef.current
    if (!cfg.text.trim()) return

    // Cooldown applies only to auto-trigger; preview button bypasses it
    if (!opts?.force) {
      const now = performance.now()
      if (now - lastSpokeAtRef.current < 1500) return
      if (speakingRef.current || synth.speaking || synth.pending) return
      lastSpokeAtRef.current = now
    } else {
      // Preview: stop anything that's playing and start fresh
      synth.cancel()
      lastSpokeAtRef.current = performance.now()
    }

    const speakNow = () => {
      const u = new SpeechSynthesisUtterance(cfg.text)
      u.lang = cfg.lang
      u.rate = cfg.rate
      u.pitch = cfg.pitch

      // Prefer a voice that matches the requested language
      const voices = synth.getVoices()
      const match = voices.find((v) => v.lang === cfg.lang)
                ?? voices.find((v) => v.lang.startsWith(cfg.lang.split('-')[0]))
      if (match) u.voice = match

      u.onstart = () => { speakingRef.current = true;  setSpeaking(true) }
      u.onend   = () => { speakingRef.current = false; setSpeaking(false) }
      u.onerror = () => { speakingRef.current = false; setSpeaking(false) }
      synth.speak(u)
    }

    // Wait for voices to load on first run (otherwise first word gets dropped)
    if (synth.getVoices().length === 0) {
      const handler = () => {
        synth.removeEventListener('voiceschanged', handler)
        speakNow()
      }
      synth.addEventListener('voiceschanged', handler)
      setTimeout(speakNow, 250)
    } else {
      speakNow()
    }
  }

  // Auto-trigger: fire on False → True transition
  useEffect(() => {
    const wasTrue = prevTriggerRef.current
    prevTriggerRef.current = trigger
    if (trigger && !wasTrue) speak()
  }, [trigger])  // ← ONLY depend on trigger; rest read via ref

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="tts" size={16} className="text-violet-400" />} hasInput={false} hasOutput={false}>
      <div className="w-[230px] space-y-1.5">
        <TextArea
          value={configText}
          onChange={(e) => updateNodeConfig(id, { text: e.target.value })}
          placeholder={text && !configText ? `(ใช้ข้อความจาก input: "${text.slice(0, 40)}")` : 'ข้อความที่จะอ่าน...'}
          rows={2}
          className="nodrag w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
        />

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">
            {speaking ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Volume2 size={12} className="animate-pulse" /> กำลังอ่าน
              </span>
            ) : trigger ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Volume2 size={12} /> พร้อม
              </span>
            ) : (
              <span className="flex items-center gap-1 text-zinc-500">
                <VolumeX size={12} /> รอ True
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600 font-mono">{lang}</span>
            <button
              onClick={(e) => { e.stopPropagation(); speak({ force: true }) }}
              disabled={!text.trim()}
              className="nodrag p-1 bg-zinc-800 hover:bg-violet-500/30 border border-zinc-700 hover:border-violet-500 rounded text-zinc-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="ทดสอบเสียง"
            >
              <Play size={10} />
            </button>
          </div>
        </div>

        {/* Two input handles — clear of the rounded corner so edge lines land cleanly */}
        <Handle
          id="text"
          type="target"
          position={Position.Left}
          style={{ top: '28%' }}
          title="text — ข้อความที่จะอ่าน"
          className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-700 hover:!bg-violet-400 hover:!scale-125 transition-all"
        />
        <Handle
          id="trigger"
          type="target"
          position={Position.Left}
          style={{ top: '72%' }}
          title="trigger — กระตุ้นให้พูด (True)"
          className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-700 hover:!bg-emerald-400 hover:!scale-125 transition-all"
        />
      </div>
    </BaseNode>
  )
}
