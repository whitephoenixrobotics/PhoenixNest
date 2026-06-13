/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useState } from 'react'
import { desktopEdition } from '@/lib/desktop'

interface LogoProps {
  size?: number
  className?: string
}

// Bump this whenever you replace /public/logo.png to force the browser
// (and Next.js image optimizer) to fetch the new file.
const LOGO_VERSION = 3

export function Logo({ size = 24, className }: LogoProps) {
  // Edition is only known in the desktop build; web visits render plain.
  // Read it after mount to keep SSR output deterministic.
  const [edition, setEdition] = useState<'CPU' | 'GPU' | null>(null)
  useEffect(() => {
    setEdition(desktopEdition())
  }, [])

  const img = (
    <img
      src={`/logo.png?v=${LOGO_VERSION}`}
      alt="PhoenixFlow"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  )

  if (!edition) return img

  const badgeColors =
    edition === 'GPU'
      ? 'bg-cyan-500 text-cyan-950 ring-cyan-300/30'
      : 'bg-zinc-500 text-zinc-950 ring-zinc-300/30'

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      title={`Phoenix Flow ${edition} edition`}
    >
      {img}
      <span
        className={`absolute -bottom-1 -right-2 px-1 rounded text-[8px] font-bold leading-[1.3] tracking-wide ring-1 ${badgeColors}`}
      >
        {edition}
      </span>
    </span>
  )
}
