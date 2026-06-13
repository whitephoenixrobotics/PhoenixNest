'use client'

/* eslint-disable @next/next/no-img-element */
import { useFlowStore } from '@/stores/flowStore'
import { cn } from '@/lib/utils'

// LINE serves the canonical sticker image on a public CDN — no auth, no
// referer check. Works for any "LINE-original" sticker the Messaging API
// accepts. Paid creator stickers return 404 here AND can't be sent anyway,
// so a broken thumbnail is itself a useful signal to the user.
const stickerUrl = (sid: number) =>
  `https://stickershop.line-scdn.net/stickershop/v1/sticker/${sid}/iPhone/sticker.png`

// Sourced from the LINE Messaging API "sample stickers" list, picked from
// the two animated packs that the public CDN actually serves (11537 +
// 11538). Older packs like 446 / 789 are valid for SENDING via API but their
// CDN previews 404 on iPhone/sticker.png — useless for a visual picker.
// Labels stay generic on purpose: the user sees the image, so we don't try
// to name a feeling that the thumbnail might not match.
const PRESETS: { pkg: number; sid: number }[] = [
  { pkg: 11537, sid: 52002734 },
  { pkg: 11537, sid: 52002735 },
  { pkg: 11537, sid: 52002738 },
  { pkg: 11537, sid: 52002744 },
  { pkg: 11538, sid: 51626494 },
  { pkg: 11538, sid: 51626496 },
  { pkg: 11538, sid: 51626502 },
  { pkg: 11538, sid: 51626511 },
]

interface Props {
  nodeId: string
  pkg: number
  sid: number
}

export function LineStickerPicker({ nodeId, pkg, sid }: Props) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)

  return (
    <div className="space-y-3">
      {/* Live preview of the current sticker */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-700">
        <img
          src={stickerUrl(sid)}
          alt={`sticker ${sid}`}
          className="w-16 h-16 object-contain shrink-0"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-zinc-200 font-mono">
            pkg {pkg}
          </div>
          <div className="text-xs text-zinc-400 font-mono mt-0.5">id {sid}</div>
        </div>
      </div>

      {/* Preset grid */}
      <div>
        <div className="text-[11px] font-medium text-zinc-400 mb-2">เลือกจากที่นิยม (LINE sample stickers)</div>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => {
            const selected = p.pkg === pkg && p.sid === sid
            return (
              <button
                key={`${p.pkg}-${p.sid}`}
                onClick={() => updateNodeConfig(nodeId, { package_id: p.pkg, sticker_id: p.sid })}
                title={`pkg ${p.pkg} · id ${p.sid}`}
                className={cn(
                  'aspect-square rounded-md border bg-zinc-950 p-1 transition-all',
                  selected
                    ? 'border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'border-zinc-700 hover:border-zinc-500',
                )}
              >
                <img
                  src={stickerUrl(p.sid)}
                  alt={`sticker ${p.sid}`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </button>
            )
          })}
        </div>
        <a
          href="https://developers.line.biz/en/docs/messaging-api/sticker-list/"
          target="_blank"
          rel="noreferrer"
          className="block mt-2 text-[10px] text-emerald-400 hover:underline"
        >
          ดูรายการ Sticker ทั้งหมด (LINE docs) →
        </a>
      </div>
    </div>
  )
}
