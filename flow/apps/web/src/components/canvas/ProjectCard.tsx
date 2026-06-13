'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Pencil, Check } from 'lucide-react'
import { Logo } from '@/components/Logo'

interface Props {
  flowName: string
  onRename: (next: string) => void
}

export function ProjectCard({ flowName, onRename }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(flowName)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select the field when entering edit mode (DOM side-effect only)
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEditing = () => {
    setDraft(flowName)   // seed draft from current name when opening editor
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== flowName) onRename(trimmed)
    setEditing(false)
  }

  return (
    <div className="m-3 p-4 bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 rounded-2xl shadow-lg">
      {/* Logo + brand — clicking logo or name goes back home */}
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/"
          title="กลับหน้าหลัก"
          className="flex flex-col items-center gap-2 group"
        >
          <div className="relative w-14 h-14 flex items-center justify-center transition-transform group-hover:scale-105">
            {/* Rainbow aura — fades in on hover, spinning behind the disc */}
            <span
              className="logo-aura absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  'conic-gradient(from 0deg, #ff0080, #ff8c00, #ffe600, #00e676, #00b0ff, #7c4dff, #ff0080)',
                filter: 'blur(5px)',
              }}
            />
            {/* Logo disc — white ring by default, black bg always */}
            <div
              className="relative w-12 h-12 rounded-full ring-2 ring-white/70 group-hover:ring-white/0 flex items-center justify-center shadow-inner transition-all"
              style={{ backgroundColor: '#09090b' }}
            >
              <Logo size={32} />
            </div>
          </div>
          <h1 className="text-base font-bold text-violet-400 group-hover:text-violet-300 transition-colors">
            PhoenixFlow
          </h1>
        </Link>
      </div>

      {/* Flow name (editable) */}
      <div className="mt-4 pt-3 border-t border-zinc-700/50">
        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">
          ชื่อโปรเจค
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="flex-1 min-w-0 px-2 py-1.5 bg-zinc-900 border border-violet-500/60 rounded-md text-xs text-zinc-100 focus:outline-none"
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              className="p-1.5 text-violet-400 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <Check size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-700 hover:border-violet-500/60 rounded-md text-xs text-zinc-100 text-left transition-all group"
            title="คลิกเพื่อแก้ไขชื่อ"
          >
            <span className="truncate">{flowName || 'ตั้งชื่อโปรเจค...'}</span>
            <Pencil size={11} className="text-zinc-600 group-hover:text-violet-400 flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  )
}
