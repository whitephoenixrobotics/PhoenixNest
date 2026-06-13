'use client'

import { useState } from 'react'
import { Globe, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseNode } from '../BaseNode'
import { useFlowStore } from '@/stores/flowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { cn } from '@/lib/utils'
import { BlockIcon } from '../BlockIcons'
import { TextInput, TextArea } from '@/components/ui/StableField'

interface Props {
  id: string
  data: { label: string; config: Record<string, unknown> }
  selected?: boolean
}

export function HttpFetchNode({ id, data, selected }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const output = useExecutionStore((s) => s.nodeStates[id]?.output) as
    | { status?: number; ok?: boolean; error?: string; text?: string }
    | undefined

  const url = (data.config?.url as string) ?? ''
  const method = ((data.config?.method as string) ?? 'GET').toUpperCase()
  const headers = (data.config?.headers as string) ?? ''
  const body = (data.config?.body as string) ?? ''
  const status = output?.status
  const ok = output?.ok === true
  const err = output?.error
  const preview = output?.text?.slice(0, 80) ?? ''

  const [advanced, setAdvanced] = useState(false)

  const fetchNow = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cur = Number(data.config?.fetch_token ?? 0)
    updateNodeConfig(id, { fetch_token: cur + 1 })
  }

  return (
    <BaseNode id={id} data={data} selected={selected} icon={<BlockIcon type="http_fetch" size={16} className="text-violet-400" />}>
      <div className="w-[238px] space-y-1.5">
        {/* Method + URL */}
        <div className="flex gap-1">
          <select
            value={method}
            onChange={(e) => updateNodeConfig(id, { method: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="nodrag text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-300 focus:outline-none focus:border-violet-500"
          >
            <option>GET</option>
            <option>POST</option>
          </select>
          <TextInput
            type="text"
            value={url}
            onChange={(e) => updateNodeConfig(id, { url: e.target.value })}
            placeholder="https://api.example.com/data"
            className="nodrag flex-1 min-w-0 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Advanced: headers + body (for API keys / POST) */}
        <button
          onClick={(e) => { e.stopPropagation(); setAdvanced((a) => !a) }}
          className="nodrag w-full flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {advanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Header / Body (API key)
        </button>
        {advanced && (
          <div className="space-y-1.5">
            <div>
              <div className="text-[10px] text-zinc-500 mb-0.5">Headers <span className="text-zinc-600">(Key: Value บรรทัดละอัน)</span></div>
              <TextArea
                value={headers}
                onChange={(e) => updateNodeConfig(id, { headers: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                rows={2}
                placeholder={'Authorization: Bearer xxxxx\nX-Api-Key: yyyyy'}
                className="nodrag w-full text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>
            {method === 'POST' && (
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Body <span className="text-zinc-600">(JSON)</span></div>
                <TextArea
                  value={body}
                  onChange={(e) => updateNodeConfig(id, { body: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  rows={2}
                  placeholder={'{"city": "Bangkok"}'}
                  className="nodrag w-full text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>
            )}
          </div>
        )}

        <button
          onClick={fetchNow}
          className="nodrag w-full flex items-center justify-center gap-1 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Globe size={12} /> Fetch
        </button>

        {/* Status */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500">Status</span>
          <span className={cn(
            'font-mono font-bold',
            err ? 'text-red-400' : ok ? 'text-emerald-400' : 'text-zinc-500'
          )}>
            {err ? 'ERROR' : status !== undefined ? status : '—'}
          </span>
        </div>

        {/* Preview */}
        {(preview || err) && (
          <div className={cn(
            'text-[10px] font-mono p-1.5 rounded max-h-[60px] overflow-auto scrollbar-themed break-words',
            err ? 'bg-red-500/10 text-red-300' : 'bg-zinc-800 text-zinc-300'
          )}>
            {err || preview}
            {!err && (output?.text?.length ?? 0) > 80 && '…'}
          </div>
        )}
      </div>
    </BaseNode>
  )
}
