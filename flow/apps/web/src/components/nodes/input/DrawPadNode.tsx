'use client'

import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

const SIZE = 220       // internal canvas resolution (square)
const PEN = 16         // thick strokes → works well for MNIST

// Black crosshair-dot cursor with a white halo so it stays visible on both
// the white canvas and the black strokes (the theme's light-mode cursor is
// white and would otherwise vanish here).
const PEN_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='6' fill='none' stroke='white' stroke-width='3'/%3E%3Ccircle cx='10' cy='10' r='6' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E\") 10 10, crosshair"

export function DrawPadNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const savedImage = data.config?.image as string | undefined

  // Init once: white background + restore any saved drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    if (savedImage) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, SIZE, SIZE)
      img.src = savedImage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (SIZE / rect.width),
      y: (e.clientY - rect.top) * (SIZE / rect.height),
    }
  }

  const start = (e: React.PointerEvent) => {
    e.stopPropagation()
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    e.stopPropagation()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = PEN
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const end = (e: React.PointerEvent) => {
    if (!drawing.current) return
    e.stopPropagation()
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) updateNodeConfig(id, { image: canvas.toDataURL('image/png') })
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    updateNodeConfig(id, { image: '' })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="draw_pad" size={16} className="text-violet-400" />} hasInput={false}>
      <div className="w-[200px] space-y-1.5">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          style={{ cursor: PEN_CURSOR }}
          className="nodrag w-full aspect-square rounded-md border border-zinc-700 bg-white touch-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">วาดด้วยเมาส์</span>
          <button
            onClick={clear}
            className="nodrag flex items-center gap-1 px-2 py-1 text-[11px] bg-zinc-800 hover:bg-red-600/30 border border-zinc-700 hover:border-red-500 rounded text-zinc-400 hover:text-red-300 transition-colors"
            title="ล้างภาพ"
          >
            <Eraser size={11} /> ล้าง
          </button>
        </div>
      </div>
    </BaseNode>
  )
}
