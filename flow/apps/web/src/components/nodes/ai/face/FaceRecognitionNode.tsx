'use client'

import { useRef } from 'react'
import { Upload, X, Camera, UserCheck, UserX } from 'lucide-react'
import { BaseNode } from '../../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { webcamRegistry } from '@/stores/webcamRegistry'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../../BlockIcons'
import { TextInput } from '@/components/ui/StableField'

const MAX_EXAMPLES = 5

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function FaceRecognitionNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { score?: number; matched?: boolean; face_found?: boolean; name?: string }
    | undefined
  const fileRef = useRef<HTMLInputElement>(null)

  const name      = (data.config?.name as string) ?? ''
  const examples  = (data.config?.examples as string[]) ?? []
  const threshold = Number(data.config?.threshold ?? 0.78)

  const addExample = (dataUrl: string) => {
    if (examples.length >= MAX_EXAMPLES) return
    updateNodeConfig(id, { examples: [...examples, dataUrl] })
  }

  const removeExample = (e: React.MouseEvent, i: number) => {
    e.stopPropagation()
    updateNodeConfig(id, { examples: examples.filter((_, idx) => idx !== i) })
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') addExample(reader.result)
    }
    reader.readAsDataURL(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const grabFromWebcam = (e: React.MouseEvent) => {
    e.stopPropagation()
    const ids = webcamRegistry.activeIds()
    if (ids.length === 0) {
      alert('ต้องเปิดกล้องใน Webcam block ก่อน')
      return
    }
    const frame = webcamRegistry.getFrame(ids[0])
    if (frame) addExample(frame)
  }

  const score = output?.score ?? 0
  const matched = output?.matched === true
  const faceFound = output?.face_found === true
  const canMatch = name.trim() !== '' && examples.length > 0

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="face_recognition" size={16} className="text-violet-400" />}>
      <div className="w-[240px] space-y-2">
        {/* Name input */}
        <TextInput
          type="text"
          value={name}
          onChange={(e) => updateNodeConfig(id, { name: e.target.value })}
          placeholder="ชื่อคนที่จะจดจำ (เช่น สมชาย)"
          className="nodrag w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
        />

        {/* Example faces */}
        <div>
          <div className="text-[10px] text-zinc-500 mb-1">
            รูปใบหน้าตัวอย่าง {examples.length}/{MAX_EXAMPLES}
          </div>
          <div className="grid grid-cols-5 gap-1">
            {examples.map((src, i) => (
              <div key={i} className="relative aspect-square group overflow-hidden rounded border border-violet-500/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`face ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => removeExample(e, i)}
                  className="nodrag absolute inset-0 flex items-center justify-center bg-red-500/0 hover:bg-red-500/70 text-transparent hover:text-white transition-colors"
                  title="ลบรูป"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {examples.length < MAX_EXAMPLES && (
              <div className="relative aspect-square">
                <button
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                  className="nodrag w-full h-1/2 flex items-center justify-center border border-dashed border-zinc-600 hover:border-violet-500 rounded-t text-zinc-500 hover:text-violet-400 transition-colors"
                  title="อัปโหลดภาพ"
                >
                  <Upload size={10} />
                </button>
                <button
                  onClick={grabFromWebcam}
                  className="nodrag w-full h-1/2 flex items-center justify-center border border-dashed border-zinc-600 hover:border-violet-500 rounded-b border-t-0 text-zinc-500 hover:text-violet-400 transition-colors"
                  title="ถ่ายจากกล้อง"
                >
                  <Camera size={10} />
                </button>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        </div>

        {/* Result */}
        <div className="border-t border-zinc-700/50 pt-1.5 space-y-1">
          {!canMatch ? (
            <div className="text-[11px] text-zinc-600 italic text-center">
              ใส่ชื่อ + อย่างน้อย 1 รูป
            </div>
          ) : !output ? (
            <div className="text-[11px] text-zinc-600 italic text-center">
              เชื่อมต่อภาพแล้วกด Run
            </div>
          ) : !faceFound ? (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 py-1">
              <UserX size={12} /> ไม่พบใบหน้าในภาพ
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">ความคล้าย</span>
                <span className={cn(
                  'font-mono font-bold',
                  matched ? 'text-emerald-400' : 'text-zinc-400'
                )}>
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden relative">
                <div
                  className={cn(
                    'h-full transition-all',
                    matched ? 'bg-emerald-500' : 'bg-zinc-500'
                  )}
                  style={{ width: `${score * 100}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-px bg-violet-400"
                  style={{ left: `${threshold * 100}%` }}
                />
              </div>
              {matched && (
                <div className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-400 mt-1">
                  <UserCheck size={12} /> {name}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </BaseNode>
  )
}
