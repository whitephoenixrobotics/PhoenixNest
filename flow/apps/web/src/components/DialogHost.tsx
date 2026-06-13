'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { registerDialogHandler, type DialogRequest } from '@/lib/dialog'

// App-wide host for uiPrompt()/uiConfirm(). Renders a themed modal instead of
// the native window.prompt/confirm (which Electron does not fully support).
export function DialogHost() {
  const [req, setReq] = useState<DialogRequest | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    registerDialogHandler((r) => {
      setReq(r)
      if (r.kind === 'prompt') setValue(r.defaultValue)
    })
    return () => registerDialogHandler(null)
  }, [])

  useEffect(() => {
    if (req?.kind === 'prompt') {
      // focus + select after the dialog mounts
      const t = setTimeout(() => inputRef.current?.select(), 30)
      return () => clearTimeout(t)
    }
  }, [req])

  const finishPrompt = (result: string | null) => {
    if (req?.kind === 'prompt') req.resolve(result)
    setReq(null)
  }
  const finishConfirm = (result: boolean) => {
    if (req?.kind === 'confirm') req.resolve(result)
    setReq(null)
  }
  const finishAlert = () => {
    if (req?.kind === 'alert') req.resolve()
    setReq(null)
  }

  // Closing via Esc / overlay click = cancel
  const onOpenChange = (open: boolean) => {
    if (!open && req) {
      if (req.kind === 'prompt') req.resolve(null)
      else if (req.kind === 'confirm') req.resolve(false)
      else req.resolve()
      setReq(null)
    }
  }

  const isPrompt = req?.kind === 'prompt'
  const isAlert = req?.kind === 'alert'

  return (
    <Dialog.Root open={!!req} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl focus:outline-none"
          onOpenAutoFocus={(e) => {
            if (isPrompt) {
              e.preventDefault()
              inputRef.current?.focus()
            }
          }}
        >
          <Dialog.Title className="text-base font-semibold text-zinc-100 whitespace-pre-line">
            {req?.message}
          </Dialog.Title>
          {/* Radix wants a description for a11y; keep it visually hidden-ish */}
          <Dialog.Description className="sr-only">
            {isPrompt ? 'กรอกข้อมูลแล้วกดตกลง' : 'ยืนยันการทำรายการ'}
          </Dialog.Description>

          {isPrompt && (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishPrompt(value)
                if (e.key === 'Escape') finishPrompt(null)
              }}
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              placeholder="พิมพ์ที่นี่..."
            />
          )}

          <div className="mt-5 flex justify-end gap-2">
            {!isAlert && (
              <button
                onClick={() => (isPrompt ? finishPrompt(null) : finishConfirm(false))}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                ยกเลิก
              </button>
            )}
            <button
              onClick={() =>
                isAlert ? finishAlert() : isPrompt ? finishPrompt(value) : finishConfirm(true)
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              ตกลง
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
