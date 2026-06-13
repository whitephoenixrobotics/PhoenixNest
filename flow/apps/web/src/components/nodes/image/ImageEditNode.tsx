'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'

const ICONS: Record<string, string> = {
  brightness: '☀️',
  contrast: '◐',
  saturation: '🌈',
  sharpen: '🔪',
  grayscale: '⬛',
  invert: '🔄',
  blur: '💧',
  rgb_adjust: '🎨',
}

interface Slider {
  key: string
  label: string
  min: number
  max: number
  step: number
}

// Inline slider definitions per block type
const SLIDERS: Record<string, Slider[]> = {
  brightness: [{ key: 'factor', label: 'ความสว่าง', min: 0, max: 3, step: 0.05 }],
  contrast: [{ key: 'factor', label: 'คอนทราสต์', min: 0, max: 3, step: 0.05 }],
  saturation: [{ key: 'factor', label: 'ความอิ่มสี', min: 0, max: 3, step: 0.05 }],
  sharpen: [{ key: 'factor', label: 'ความคม', min: 0, max: 5, step: 0.1 }],
  blur: [{ key: 'radius', label: 'เบลอ (px)', min: 0, max: 20, step: 0.5 }],
  rgb_adjust: [
    { key: 'r', label: 'Red', min: 0, max: 2, step: 0.05 },
    { key: 'g', label: 'Green', min: 0, max: 2, step: 0.05 },
    { key: 'b', label: 'Blue', min: 0, max: 2, step: 0.05 },
  ],
}

interface Props {
  id: string
  type?: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function ImageEditNode({ id, type, data, selected }: Props) {
  const icon = ICONS[type || ''] || '🖼️'
  const sliders = SLIDERS[type || ''] || []
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { image?: string }
    | undefined

  return (
    <BaseNode id={id} data={data} selected={selected} icon={icon}>
      <div className="w-[190px] space-y-2">
        {sliders.length === 0 ? (
          <div className="text-[11px] text-zinc-500 italic">ไม่มีพารามิเตอร์</div>
        ) : (
          sliders.map((s) => {
            const value = Number(data.config[s.key] ?? s.min)
            return (
              <div key={s.key} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">{s.label}</span>
                  <span className="text-[10px] font-mono text-violet-300 tabular-nums">
                    {value.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={value}
                  onChange={(e) =>
                    updateNodeConfig(id, { [s.key]: parseFloat(e.target.value) })
                  }
                  className="nodrag w-full h-1 accent-violet-500 cursor-pointer"
                />
              </div>
            )
          })
        )}

        {output?.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={output.image}
            alt="preview"
            className="nodrag w-full rounded-md border border-zinc-700 mt-1"
          />
        )}
      </div>
    </BaseNode>
  )
}
