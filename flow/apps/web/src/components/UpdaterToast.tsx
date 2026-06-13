'use client'

import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { isDesktop, onUpdate, quitAndInstall, type UpdateInfo } from '@/lib/desktop'

// App-wide toast that surfaces electron-updater progress. No-op on the web.
export function UpdaterToast() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isDesktop()) return
    onUpdate((i) => {
      setInfo(i)
      if (i.event === 'available' || i.event === 'downloaded') setDismissed(false)
    })
  }, [])

  if (!info || dismissed) return null
  // Only show meaningful states to the user.
  if (info.event === 'checking' || info.event === 'not-available' || info.event === 'error') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 text-zinc-100">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-violet-500/15 rounded-lg text-violet-300 mt-0.5">
          {info.event === 'downloaded' ? <RefreshCw size={16} /> : <Download size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          {info.event === 'available' && (
            <>
              <p className="text-sm font-medium">มีเวอร์ชันใหม่ {info.version && `(v${info.version})`}</p>
              <p className="text-xs text-zinc-400 mt-0.5">กำลังเตรียมดาวน์โหลด...</p>
            </>
          )}
          {info.event === 'downloading' && (
            <>
              <p className="text-sm font-medium">กำลังดาวน์โหลดอัปเดต</p>
              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{ width: `${info.percent ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">{info.percent ?? 0}%</p>
            </>
          )}
          {info.event === 'downloaded' && (
            <>
              <p className="text-sm font-medium">อัปเดตพร้อมติดตั้ง {info.version && `(v${info.version})`}</p>
              <p className="text-xs text-zinc-400 mt-0.5">รีสตาร์ทเพื่อใช้เวอร์ชันใหม่</p>
              <button
                onClick={() => quitAndInstall()}
                className="mt-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                รีสตาร์ทและติดตั้ง
              </button>
            </>
          )}
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 text-zinc-500 hover:text-zinc-300" title="ปิด">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
