/* eslint-disable @next/next/no-img-element */
'use client'

import { Handle, Position } from '@xyflow/react'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { useLineStore } from '@/stores/lineStore'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  type: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

// One component covers all four LINE Push blocks. Type-specific bits (icon,
// subtitle, preview shown in the body) are derived from `type`.
export function LineNode({ id, type, data, selected }: Props) {
  const status = useExecutionStore((s) => s.getNodeStatus(id))
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { ok?: boolean; sent?: boolean; text?: string; url?: string;
        package_id?: number; sticker_id?: number; alt_text?: string;
        error?: string; trigger?: boolean }
    | undefined
  const selectNode = useFlowStore((s) => s.selectNode)
  const configured = useLineStore((s) => s.configured)

  const meta = META_BY_TYPE[type] ?? META_BY_TYPE.line_push_text
  const sent = output?.sent === true
  const error = output?.ok === false ? output.error : null
  const preview = derivePreview(type, data.config, output)

  return (
    <div
      onClick={() => selectNode(id)}
      className={cn(
        'rounded-2xl border-2 cursor-pointer transition-all overflow-hidden bg-zinc-900',
        error ? 'border-red-500'
          : !configured ? 'border-zinc-700 opacity-70'
          : sent ? 'border-emerald-500/80 shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)]'
          : 'border-emerald-700/60',
        selected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-950',
        status === 'skipped' && 'opacity-40',
      )}
      style={{ minWidth: 188 }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50 bg-emerald-950/30">
        <span className="text-lg leading-none">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-emerald-100 truncate">{data.label}</div>
          <div className="text-[10px] text-emerald-400/70">{meta.subtitle}</div>
        </div>
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            status === 'running' ? 'bg-blue-400 animate-ping' :
            error ? 'bg-red-400' :
            sent ? 'bg-emerald-400' :
            !configured ? 'bg-zinc-600' : 'bg-emerald-700',
          )}
        />
      </div>

      <div className="px-3 py-2.5 text-center">
        {error ? (
          <div className="text-[11px] text-red-300 leading-tight">{error}</div>
        ) : !configured ? (
          <div className="text-[11px] text-zinc-500 leading-tight">
            ยังไม่ได้ตั้งค่า LINE<br/>
            <span className="text-emerald-400">(เปิด Connector)</span>
          </div>
        ) : (
          preview
        )}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-emerald-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-700"
      />
    </div>
  )
}

const META_BY_TYPE: Record<string, { icon: string; subtitle: string }> = {
  line_push_text:    { icon: '💬', subtitle: 'LINE Push Text' },
  line_push_image:   { icon: '🖼️', subtitle: 'LINE Push Image' },
  line_push_sticker: { icon: '😀', subtitle: 'LINE Push Sticker' },
  line_push_flex:    { icon: '🧩', subtitle: 'LINE Push Flex' },
}

function derivePreview(
  type: string,
  config: Record<string, unknown>,
  output: { text?: string; url?: string; package_id?: number; sticker_id?: number; alt_text?: string } | undefined,
) {
  if (type === 'line_push_text') {
    const text = output?.text ?? (config.text as string) ?? ''
    return (
      <div className="text-[11px] text-zinc-300 leading-tight line-clamp-2 break-words">
        {text || <span className="text-zinc-600 italic">ส่งเมื่อ input = True</span>}
      </div>
    )
  }
  if (type === 'line_push_image') {
    const url = output?.url ?? (config.image_url as string) ?? ''
    return (
      <div className="text-[10px] text-zinc-400 font-mono truncate" title={url}>
        {url || <span className="text-zinc-600 italic">ใส่ image URL (HTTPS)</span>}
      </div>
    )
  }
  if (type === 'line_push_sticker') {
    const pkg = output?.package_id ?? (config.package_id as number) ?? 446
    const sid = output?.sticker_id ?? (config.sticker_id as number) ?? 1988
    // Public LINE CDN — same URL pattern as the picker. 404s for paid creator
    // stickers (which the API can't send either, so a broken thumbnail is an
    // honest signal that this sticker won't work).
    const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${sid}/iPhone/sticker.png`
    return (
      <div className="flex flex-col items-center gap-1">
        <img
          src={stickerUrl}
          alt={`sticker ${sid}`}
          className="w-16 h-16 object-contain"
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
        />
        <div className="text-[9px] text-zinc-500 font-mono">pkg {pkg} · id {sid}</div>
      </div>
    )
  }
  if (type === 'line_push_flex') {
    const alt = output?.alt_text ?? (config.alt_text as string) ?? ''
    return (
      <div className="text-[11px] text-zinc-300 leading-tight line-clamp-2">
        {alt || <span className="text-zinc-600 italic">ใส่ Flex JSON ใน config</span>}
      </div>
    )
  }
  return null
}
