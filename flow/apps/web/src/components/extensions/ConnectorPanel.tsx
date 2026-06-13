'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Cable, RefreshCw, Plug, PlugZap, Loader2, AlertTriangle, Check, ChevronDown,
  MessageCircle, Send, Eye, EyeOff,
} from 'lucide-react'
import { useArduinoStore } from '@/stores/arduinoStore'
import { useLineStore } from '@/stores/lineStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

// Board-connection dialog — Connect / Flash / Disconnect for each supported
// board. Pure hardware lifecycle; the "Extensions" dialog (separate, at the
// bottom of the palette) is what controls which block categories appear in
// the tool palette.
export function ConnectorPanel({ open, onClose }: Props) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Cable size={18} className="text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">Connector</h2>
              <p className="text-xs text-zinc-500 mt-0.5">เชื่อมต่อบอร์ดและอุปกรณ์ภายนอก</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          <ArduinoCard />
          <LineCard />
          <ComingSoon name="ESP32" description="Wi-Fi / BLE microcontroller" />
          <ComingSoon name="Raspberry Pi Pico" description="RP2040 microcontroller" />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ComingSoon({ name, description }: { name: string; description: string }) {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 opacity-50">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-400">{name}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{description}</div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">coming soon</span>
      </div>
    </div>
  )
}

function ArduinoCard() {
  const {
    state, port, firmwareName, firmwareVersion, ports, bundleOk, bundleMsg,
    lastError, lastFlashLog,
    refreshPorts, refreshStatus, connect, disconnect, flash,
  } = useArduinoStore()
  const [selectedPort, setSelectedPort] = useState<string>('')
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    refreshStatus()
    refreshPorts()
  }, [refreshStatus, refreshPorts])

  useEffect(() => {
    if (selectedPort) return
    if (port) { setSelectedPort(port); return }
    const auto = ports.find((p) => p.likely_arduino) ?? ports[0]
    if (auto) setSelectedPort(auto.device)
  }, [ports, port, selectedPort])

  const connected = state === 'connected'
  const busy = state === 'connecting' || state === 'flashing'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">🔌</span>
          <div>
            <div className="text-sm font-bold text-zinc-100">Arduino UNO</div>
            <div className="text-[11px] text-zinc-500">
              {connected
                ? <>เชื่อมต่อ {port} • {firmwareName ?? 'StandardFirmata'} {firmwareVersion ? `v${firmwareVersion[0]}.${firmwareVersion[1]}` : ''}</>
                : 'ATmega328P • รองรับ digital / PWM / servo / analog'}
            </div>
          </div>
        </div>
        <StatusPill state={state} />
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={busy}
              className="appearance-none w-full pl-3 pr-8 py-2 text-sm bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:border-cyan-500 focus:outline-none"
            >
              {ports.length === 0 && <option value="">ไม่พบพอร์ต — เสียบสาย USB แล้วกด ⟳</option>}
              {ports.map((p) => (
                <option key={p.device} value={p.device}>
                  {p.device} — {p.description}{p.likely_arduino ? ' ★' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>
          <button
            onClick={() => refreshPorts()}
            disabled={busy}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40"
            title="รีเฟรชรายการพอร์ต"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {connected ? (
            <button
              onClick={() => disconnect()}
              className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm font-medium border border-red-900/40"
            >
              <Plug size={14} /> Disconnect
            </button>
          ) : (
            <>
              <button
                onClick={() => selectedPort && connect(selectedPort)}
                disabled={!selectedPort || busy}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
                Connect
              </button>
              <button
                onClick={() => selectedPort && flash(selectedPort)}
                disabled={!selectedPort || busy || !bundleOk}
                title={bundleOk ? 'อัพโหลด Phoenix firmware ลงบอร์ด' : bundleMsg}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === 'flashing' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Flash firmware
              </button>
            </>
          )}
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          ครั้งแรกที่ใช้ Arduino UNO ต้องกด <b className="text-zinc-400">Flash firmware</b> ก่อน 1 ครั้ง
          เพื่ออัพโหลด Phoenix firmware ลงบอร์ด หลังจากนั้นกด Connect ได้เลย
        </p>

        {lastError && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-900/20 border border-red-900/40 text-red-300 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{lastError}</span>
          </div>
        )}
        {lastFlashLog && (
          <div className="text-[11px]">
            <button
              onClick={() => setShowLog((v) => !v)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              {showLog ? '▾ ซ่อน' : '▸ แสดง'} flash log
            </button>
            {showLog && (
              <pre className="mt-1 max-h-40 overflow-auto p-2 bg-black/60 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono">
                {lastFlashLog}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── LINE Messaging ──────────────────────────────────────────────────────────
function LineCard() {
  const { state, configured, defaultTo, botName, botUserId, lastError, lastTestOk,
    refreshStatus, configure, disconnect, test } = useLineStore()
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [editTo, setEditTo] = useState('')
  const [testText, setTestText] = useState('ทดสอบจาก Phoenix Flow ✅')

  useEffect(() => { refreshStatus() }, [refreshStatus])
  useEffect(() => { setEditTo(defaultTo) }, [defaultTo])

  const busy = state === 'configuring' || state === 'testing'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">💬</span>
          <div>
            <div className="text-sm font-bold text-zinc-100">LINE Messaging</div>
            <div className="text-[11px] text-zinc-500">
              {configured
                ? <>เชื่อมต่อกับบอท <b className="text-zinc-300">{botName || 'LINE Bot'}</b></>
                : 'Push ข้อความเข้า LINE เมื่อ flow ทริกเกอร์'}
            </div>
          </div>
        </div>
        <span className={cn(
          'text-[10px] px-2 py-1 rounded-full font-medium',
          configured ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400',
        )}>
          {configured ? 'Connected' : 'Not configured'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {!configured ? (
          <>
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                Channel Access Token <span className="text-zinc-600">(จาก LINE Developers Console)</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="long-lived channel access token..."
                  className="w-full pl-3 pr-9 py-2 text-sm font-mono bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                  title={showToken ? 'ซ่อน' : 'แสดง'}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                Default User / Group / Room ID <span className="text-zinc-600">(ใช้เมื่อบล็อคไม่ได้ระบุ)</span>
              </label>
              <input
                type="text"
                value={editTo}
                onChange={(e) => setEditTo(e.target.value)}
                placeholder="U... / C... / R..."
                className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => token && configure(token, editTo)}
              disabled={!token.trim() || busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === 'configuring' ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
              ตั้งค่าและตรวจสอบ
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-zinc-500">Bot ID</span>
              <span className="font-mono text-zinc-300 truncate" title={botUserId}>{botUserId || '—'}</span>
              <span className="text-zinc-500">Default target</span>
              <span className="font-mono text-zinc-300 truncate" title={defaultTo}>{defaultTo || '— (ต้องระบุในบล็อค)'}</span>
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">ทดสอบ Push (ส่งจริง)</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  placeholder={defaultTo || 'user / group ID'}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none mb-2"
              />
              <button
                onClick={() => test(editTo, testText)}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium disabled:opacity-40"
              >
                {state === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                ส่งทดสอบ
              </button>
              {lastTestOk === true && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
                  <Check size={12} /> ส่งสำเร็จ — ตรวจในแอป LINE
                </div>
              )}
            </div>

            <button
              onClick={() => disconnect()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs border border-red-900/40"
            >
              <Plug size={13} /> ตัดการเชื่อมต่อ (ลบ token)
            </button>
          </>
        )}

        {lastError && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-900/20 border border-red-900/40 text-red-300 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{lastError}</span>
          </div>
        )}

        <p className="text-[10px] text-zinc-600 leading-relaxed">
          วิธีรับ token: <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer"
            className="text-emerald-400 hover:underline">LINE Developers Console</a> → Provider →
          Messaging API channel → tab <b>Messaging API</b> → Channel access token (issue/long-lived).
          User ID หาได้ตอน user แอด LINE OA แล้วส่งข้อความ — backend webhook จะ log userId มาให้
          (ตอนนี้ test ง่ายสุดคือ broadcast ผ่าน Group ID).
        </p>
      </div>
    </div>
  )
}

// Helper that triggers MessageCircle import — keeping the icon available for
// future LINE sub-cards (e.g. Push Image, Sticker) without re-editing imports.
const _LineIconRefs = { MessageCircle }
void _LineIconRefs

function StatusPill({ state }: { state: ReturnType<typeof useArduinoStore.getState>['state'] }) {
  const map = {
    disconnected: { text: 'Disconnected', cls: 'bg-zinc-800 text-zinc-400' },
    connecting:   { text: 'Connecting…', cls: 'bg-amber-900/40 text-amber-300' },
    connected:    { text: 'Connected',   cls: 'bg-emerald-900/40 text-emerald-300' },
    flashing:     { text: 'Flashing…',   cls: 'bg-cyan-900/40 text-cyan-300' },
  } as const
  const s = map[state]
  return (
    <span className={cn('text-[10px] px-2 py-1 rounded-full font-medium', s.cls)}>
      {s.text}
    </span>
  )
}
