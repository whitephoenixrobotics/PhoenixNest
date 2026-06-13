'use client'

import { useEffect, useRef, useState } from 'react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'

// Six dice faces (just for the spinning animation — final value is the number)
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function RandomNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { value?: number; text?: string }
    | undefined

  const value = output?.text

  const [rolling, setRolling] = useState(false)
  const [tickFace, setTickFace] = useState(0)
  // Bumped on every roll so the result re-animates even when the number repeats
  const [rollSeq, setRollSeq] = useState(0)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Spin on every execution result. Each run produces a fresh `output` object,
  // so depending on its identity (not the text) fires even when the new random
  // value equals the previous one.
  useEffect(() => {
    if (output?.text === undefined) return

    /* eslint-disable react-hooks/set-state-in-effect -- animation is driven by
       execution results arriving from the zustand store (external system) */
    setRolling(true)
    setRollSeq((q) => q + 1)
    /* eslint-enable react-hooks/set-state-in-effect */
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)

    tickIntervalRef.current = setInterval(() => {
      setTickFace((f) => (f + 1) % 6)
    }, 60)

    stopTimerRef.current = setTimeout(() => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
      setRolling(false)
    }, 600)
  }, [output])

  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    }
  }, [])

  const rollNow = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cur = Number(data.config?.roll_token ?? 0)
    updateNodeConfig(id, { roll_token: cur + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="random_number" size={16} className="text-violet-400" />}>
      <div className="w-[90px] mx-auto flex justify-center">
        <button
          onClick={rollNow}
          className={cn(
            'nodrag w-[90px] h-[90px] flex items-center justify-center rounded-xl bg-zinc-800 border-2 transition-all relative overflow-hidden group',
            rolling
              ? 'border-violet-500 shadow-[0_0_18px_3px_rgba(167,139,250,0.35)]'
              : 'border-zinc-700 hover:border-violet-500'
          )}
          title="คลิกเพื่อสุ่ม"
        >
          {rolling && (
            <span className="absolute inset-0 bg-violet-500/10 animate-pulse" />
          )}

          {rolling ? (
            <span
              className="text-5xl select-none animate-spin text-violet-300 leading-none"
              style={{ filter: 'drop-shadow(0 0 8px rgba(167,139,250,.8))' }}
            >
              {DICE_FACES[tickFace]}
            </span>
          ) : value !== undefined ? (
            <span
              key={rollSeq}
              className="text-3xl font-bold font-mono tabular-nums text-violet-300 animate-in zoom-in-50 duration-300 leading-none"
            >
              {value}
            </span>
          ) : (
            <span className="text-4xl select-none text-zinc-500 group-hover:scale-110 group-hover:text-violet-300 transition-transform leading-none">
              🎲
            </span>
          )}
        </button>
      </div>
    </BaseNode>
  )
}
