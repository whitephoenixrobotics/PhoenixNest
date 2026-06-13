'use client'

import { BaseNode } from '../BaseNode'
import { useExecutionStore } from '@/stores/executionStore'
import { useFlowStore } from '@/stores/flowStore'
import { BlockIcon } from '../BlockIcons'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function DisplayNode({ id, data, selected }: Props) {
  const nodeState = useExecutionStore((s) => s.nodeStates[id])
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = nodeState?.output as
    | { image?: string; text?: string; headers?: string[]; rows?: unknown[][] }
    | undefined

  const hasImage = !!output?.image
  const hasTable = Array.isArray(output?.headers) && output!.headers!.length > 0
  const hasText = !!output?.text

  // Stay compact (original size) until the user drags to resize — then fill the
  // box. Avoids ballooning to a full webcam frame the moment it's connected.
  const sized = !!data.config?.resized
  const markResized = () => {
    if (!data.config?.resized) updateNodeConfig(id, { resized: true })
  }

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      icon={<BlockIcon type="display" size={16} className="text-violet-400" />}
      hasOutput={false}
      resizable
      fill={sized}
      minWidth={200}
      minHeight={140}
      onResize={markResized}
    >
      <div className={cn(sized ? 'w-full h-full flex flex-col gap-2' : 'w-[240px] space-y-2')}>
        {hasImage && (
          <div className={cn('nodrag', sized && 'flex-1 min-h-0')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output!.image}
              alt="result"
              className={cn(
                'rounded-md border border-zinc-700',
                sized ? 'w-full h-full object-contain' : 'w-full'
              )}
            />
          </div>
        )}

        {hasTable && (
          <div className={cn(
            'nodrag border border-zinc-700 rounded-md overflow-auto scrollbar-themed bg-zinc-900',
            sized ? 'flex-1 min-h-0' : 'max-h-[180px]'
          )}>
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-zinc-800">
                <tr>
                  {output!.headers!.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left text-violet-300 font-medium border-b border-zinc-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(output!.rows ?? []).map((r, ri) => (
                  <tr key={ri} className="even:bg-zinc-800/30">
                    {output!.headers!.map((_, ci) => (
                      <td key={ci} className="px-2 py-1 text-zinc-200 border-b border-zinc-800/50 whitespace-nowrap">
                        {cellText(Array.isArray(r) ? r[ci] : undefined)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasText && (
          <div className={cn(
            'nodrag p-2 bg-zinc-800 rounded-md text-zinc-200 text-xs overflow-auto scrollbar-themed whitespace-pre-wrap break-words',
            sized ? 'flex-1 min-h-0' : 'max-h-[160px]'
          )}>
            {output!.text}
          </div>
        )}

        {!hasImage && !hasTable && !hasText && (
          <div className={cn(
            'text-[11px] text-zinc-600 italic text-center',
            sized ? 'flex-1 flex items-center justify-center' : 'py-2'
          )}>
            เชื่อมต่อ block แล้วกด Run<br />เพื่อแสดงผลลัพธ์
          </div>
        )}
      </div>
    </BaseNode>
  )
}
