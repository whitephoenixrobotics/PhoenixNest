'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Camera, CameraOff, Upload, Plus, Trash2, Loader2, Play,
  CheckCircle2, AlertTriangle, Aperture, Square, Download, FileArchive, FolderUp,
  FlaskConical, X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { trainApi } from '@/lib/api-client'
import { ModelUpload } from '@/components/nodes/dl/ModelUpload'

const readDataURL = (file: File) =>
  new Promise<string>((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(file)
  })

const isImageFile = (f: File) =>
  f.type.startsWith('image/') || /\.(jpe?g|png|bmp|webp)$/i.test(f.name)

interface Project {
  id: string
  name: string
  status: 'draft' | 'training' | 'done' | 'failed'
  progress: { epoch: number; total: number; accuracy?: number | null }
  stage?: string | null
  classes: Record<string, number>
  accuracy?: number | null
  per_class?: Record<string, { correct: number; total: number }>
  mistakes?: { file: string; true: string; pred: string }[]
  aug_mode?: string | null
  base_model_id?: string | null
  base_model_name?: string | null
  model_id?: string | null
  model_name?: string | null
  error?: string | null
}

export default function ClassifyTrainPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [proj, setProj] = useState<Project | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [newClass, setNewClass] = useState('')
  const [epochs, setEpochs] = useState(30)
  const [targetAcc, setTargetAcc] = useState(0)   // % — 0 = train all epochs
  const [modelSize, setModelSize] = useState<'n' | 's' | 'm'>('n')
  const [mistakeUrls, setMistakeUrls] = useState<Record<string, string>>({})
  const [augOn, setAugOn] = useState(false)
  const [augMode, setAugMode] = useState<'offline' | 'onfly'>('onfly')
  const [genBusy, setGenBusy] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testImg, setTestImg] = useState<string | null>(null)
  const [testCam, setTestCam] = useState(false)
  const [testResult, setTestResult] = useState<{ label: string; confidence: number; top5: { label: string; confidence: number }[] } | null>(null)
  const testVideoRef = useRef<HTMLVideoElement>(null)
  const testStreamRef = useRef<MediaStream | null>(null)
  const testFileRef = useRef<HTMLInputElement>(null)
  const [augOpts, setAugOpts] = useState({ flip: true, rotate: true, color: true, erase: false })
  const [augFactor, setAugFactor] = useState(3)
  const [camOn, setCamOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)

  // <input webkitdirectory> isn't typed in React — set attributes via a
  // callback ref so they apply the moment the element actually mounts
  // (a useEffect would run while proj is still null and the input is unmounted).
  const folderInputRef = (el: HTMLInputElement | null) => {
    folderRef.current = el
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    }
  }

  const load = useCallback(async () => {
    const res = await trainApi.get(id)
    setProj(res.data)
    setActive((prev) => prev ?? Object.keys(res.data.classes ?? {})[0] ?? null)
  }, [id])

  useEffect(() => {
    // Auth is handled by the axios interceptor (401 → /login). No localStorage check.
    let alive = true
    trainApi.get(id)
      .then((res) => {
        if (!alive) return
        setProj(res.data)
        setActive((prev) => prev ?? Object.keys(res.data.classes ?? {})[0] ?? null)
      })
      .catch(() => router.push('/'))
    return () => { alive = false }
  }, [id, router])

  // Poll while training
  useEffect(() => {
    if (proj?.status !== 'training') return
    const t = setInterval(() => {
      trainApi.status(id).then((r) => setProj(r.data)).catch(() => {})
    }, 1500)
    return () => clearInterval(t)
  }, [proj?.status, id])

  // Stop cameras on unmount (inline so we don't reference stopCam before init)
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    testStreamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      streamRef.current = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        await videoRef.current.play()
      }
      setCamOn(true)
    } catch {
      alert('เปิดกล้องไม่ได้ — ตรวจสอบสิทธิ์การใช้กล้อง')
    }
  }

  const grabFrame = (): string | null => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', 0.9)
  }

  const addImages = async (images: string[]) => {
    if (!active || images.length === 0) return
    setSaving(true)
    try {
      await trainApi.addImages(id, active, images)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const snap = async (n = 1) => {
    const frames: string[] = []
    for (let i = 0; i < n; i++) {
      const f = grabFrame()
      if (f) frames.push(f)
      if (n > 1) await new Promise((r) => setTimeout(r, 120))
    }
    await addImages(frames)
  }

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const urls = await Promise.all(files.map(readDataURL))
    await addImages(urls)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Import a .zip whose sub-folders are classes (handled on the backend)
  const onZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting('กำลังนำเข้า ZIP...')
    try {
      await trainApi.importZip(id, file)
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'นำเข้า ZIP ไม่สำเร็จ')
    } finally {
      setImporting(null)
      if (zipRef.current) zipRef.current.value = ''
    }
  }

  // Import a folder: each file's parent folder = its class
  const onFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(isImageFile)
    if (!files.length) return
    const groups: Record<string, File[]> = {}
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const parts = rel.split('/')
      const cls = parts.length >= 2 ? parts[parts.length - 2] : 'unsorted'
      ;(groups[cls] ??= []).push(f)
    }
    try {
      const entries = Object.entries(groups)
      for (const [cls, fs] of entries) {
        await trainApi.addClass(id, cls)
        for (let i = 0; i < fs.length; i += 40) {
          setImporting(`กำลังนำเข้า "${cls}" (${Math.min(i + 40, fs.length)}/${fs.length})...`)
          const urls = await Promise.all(fs.slice(i, i + 40).map(readDataURL))
          await trainApi.addImages(id, cls, urls)
        }
      }
      await load()
    } finally {
      setImporting(null)
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  const addClass = async () => {
    const name = newClass.trim()
    if (!name) return
    await trainApi.addClass(id, name)
    setNewClass('')
    await load()
    setActive(name)
  }

  const removeClass = async (name: string) => {
    if (!confirm(`ลบคลาส "${name}"?`)) return
    await trainApi.deleteClass(id, name)
    if (active === name) setActive(null)
    await load()
  }

  // Thumbnails for the misclassified-examples gallery (authed blob → object URL)
  useEffect(() => {
    if (!proj?.mistakes?.length) return
    for (const m of proj.mistakes) {
      const key = `${m.true}/${m.file}`
      if (mistakeUrls[key]) continue
      trainApi.photo(id, m.true, m.file).then((r) => {
        const u = URL.createObjectURL(r.data as Blob)
        setMistakeUrls((prev) => (prev[key] ? prev : { ...prev, [key]: u }))
      }).catch(() => {})
    }
  }, [proj?.mistakes, id, mistakeUrls])

  const startTrain = async () => {
    try {
      setStopping(false)
      await trainApi.train(
        id,
        epochs,
        targetAcc > 0 ? targetAcc / 100 : undefined,
        augOn ? { ...augOpts, mode: augMode, factor: augFactor } : null,
        modelSize,
      )
      await load()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'เริ่มเทรนไม่สำเร็จ')
    }
  }

  const stopTrain = async () => {
    setStopping(true)
    try { await trainApi.stop(id) } catch { /* ignore */ }
  }

  const saveBlob = (data: Blob, filename: string) => {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const download = async () => {
    const res = await trainApi.download(id)
    saveBlob(res.data as Blob, proj?.model_name || 'model.pt')
  }


  // ── model tester ──
  const runPredict = async (dataURL: string) => {
    setTestImg(dataURL); setTestResult(null); setTestBusy(true)
    try {
      const r = await trainApi.predict(id, dataURL)
      setTestResult(r.data)
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'ทดสอบไม่สำเร็จ')
    } finally { setTestBusy(false) }
  }
  const openTest = () => { setTestOpen(true); setTestImg(null); setTestResult(null) }
  const stopTestCam = () => { testStreamRef.current?.getTracks().forEach((t) => t.stop()); testStreamRef.current = null; setTestCam(false) }
  const closeTest = () => { stopTestCam(); setTestOpen(false) }
  const startTestCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      testStreamRef.current = s
      if (testVideoRef.current) { testVideoRef.current.srcObject = s; await testVideoRef.current.play() }
      setTestCam(true)
    } catch { alert('เปิดกล้องไม่ได้') }
  }
  const snapTest = () => {
    const v = testVideoRef.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    runPredict(c.toDataURL('image/jpeg', 0.9))
  }
  const onTestFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) runPredict(await readDataURL(f))
    if (testFileRef.current) testFileRef.current.value = ''
  }

  // Offline: build & download an augmented dataset immediately (no training)
  const generateDataset = async () => {
    setGenBusy(true)
    try {
      const res = await trainApi.augmentDataset(id, { ...augOpts, factor: augFactor })
      saveBlob(res.data as Blob, `${proj?.name || 'dataset'}_augmented.zip`)
    } catch {
      alert('สร้าง dataset ไม่สำเร็จ — ต้องมีรูปในคลาสก่อน')
    } finally {
      setGenBusy(false)
    }
  }

  if (!proj) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center gap-2 justify-center text-zinc-400">
        <Loader2 className="animate-spin" size={18} /> Loading...
      </div>
    )
  }

  const classNames = Object.keys(proj.classes ?? {})
  const totalImgs = classNames.reduce((a, c) => a + proj.classes[c], 0)
  const projectedImgs = augOn && augMode === 'offline' ? totalImgs * augFactor : totalImgs
  const canTrain = classNames.length >= 2 && classNames.every((c) => proj.classes[c] >= 2)
  const training = proj.status === 'training'
  const pct = proj.progress.total
    ? Math.min(100, Math.round((Math.min(proj.progress.epoch, proj.progress.total) / proj.progress.total) * 100))
    : 0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100" title="กลับหน้าหลัก">
          <ArrowLeft size={18} />
        </button>
        <Logo size={24} />
        <div className="flex-1">
          <h1 className="text-base font-bold text-white leading-tight">{proj.name}</h1>
          <p className="text-[11px] text-zinc-500">TrainAI · จำแนกภาพ</p>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LEFT: classes + data ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">1. สร้างคลาส & เก็บรูป</h2>

          {/* add class */}
          <div className="flex gap-2">
            <input
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addClass()}
              placeholder="ชื่อคลาส เช่น แมว / หมา"
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            />
            <button onClick={addClass} className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">
              <Plus size={14} /> เพิ่ม
            </button>
          </div>

          {/* bulk import: zip / folder (folder name = class) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => zipRef.current?.click()}
              disabled={!!importing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs disabled:opacity-50"
            >
              <FileArchive size={13} /> นำเข้า ZIP
            </button>
            <button
              onClick={() => folderRef.current?.click()}
              disabled={!!importing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs disabled:opacity-50"
            >
              <FolderUp size={13} /> นำเข้าโฟลเดอร์
            </button>
            {importing && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                <Loader2 size={12} className="animate-spin" /> {importing}
              </span>
            )}
            <input ref={zipRef} type="file" accept=".zip" onChange={onZip} className="hidden" />
            <input ref={folderInputRef} type="file" multiple onChange={onFolder} className="hidden" />
          </div>
          <p className="text-[10px] text-zinc-600">
            ZIP/โฟลเดอร์: ชื่อโฟลเดอร์ย่อย = ชื่อคลาส (เช่น <span className="font-mono">cat/, dog/</span>)
          </p>

          {/* class chips */}
          <div className="space-y-2">
            {classNames.length === 0 && (
              <p className="text-xs text-zinc-600 italic">ยังไม่มีคลาส — เพิ่มอย่างน้อย 2 คลาส</p>
            )}
            {classNames.map((c) => (
              <div
                key={c}
                onClick={() => setActive(c)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  active === c
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <span className="text-sm font-medium">{c}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${proj.classes[c] >= 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {proj.classes[c]} รูป
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); removeClass(c) }} className="text-zinc-500 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* capture panel */}
          {active && (
            <div className="border border-zinc-800 rounded-xl p-3 space-y-2 bg-zinc-900/50">
              <div className="text-xs text-zinc-400">
                เพิ่มรูปให้คลาส <span className="text-emerald-400 font-medium">{active}</span>
              </div>

              <video ref={videoRef} className={`w-full rounded-lg border border-zinc-800 ${camOn ? '' : 'hidden'}`} muted playsInline />

              <div className="flex flex-wrap gap-2">
                {!camOn ? (
                  <button onClick={startCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                    <Camera size={14} /> เปิดกล้อง
                  </button>
                ) : (
                  <>
                    <button onClick={() => snap(1)} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm disabled:opacity-50">
                      <Aperture size={14} /> ถ่าย 1
                    </button>
                    <button onClick={() => snap(15)} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/80 hover:bg-emerald-500 rounded-lg text-sm disabled:opacity-50">
                      <Aperture size={14} /> ถ่ายรัว 15
                    </button>
                    <button onClick={stopCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                      <CameraOff size={14} /> ปิด
                    </button>
                  </>
                )}
                <button onClick={() => fileRef.current?.click()} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-50">
                  <Upload size={14} /> อัปโหลด
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} className="hidden" />
                {saving && <span className="flex items-center gap-1 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> กำลังบันทึก</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: train ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">2. Augmentation</h2>

          {/* augmentation (optional) */}
          <div className="border border-zinc-800 rounded-xl p-4 space-y-2 bg-zinc-900/50">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-zinc-300">เพิ่มความหลากหลายข้อมูล (Augmentation)</span>
                <span className="block text-[10px] text-zinc-600">พลิก/หมุน/ปรับสี ช่วยให้โมเดลทนทานขึ้น</span>
              </div>
              <input
                type="checkbox" checked={augOn} disabled={training}
                onChange={(e) => setAugOn(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
            </label>
            {augOn && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setAugMode('onfly')}
                  disabled={training}
                  className={`px-2 py-1.5 rounded-lg border text-xs transition-all ${
                    augMode === 'onfly' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  On-the-fly (สุ่มตอนเทรน)
                </button>
                <button
                  onClick={() => setAugMode('offline')}
                  disabled={training}
                  className={`px-2 py-1.5 rounded-lg border text-xs transition-all ${
                    augMode === 'offline' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Offline (เพิ่มไฟล์จริง)
                </button>
              </div>
            )}
            {augOn && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {([
                  { k: 'flip', label: '🔄 พลิกซ้าย-ขวา' },
                  { k: 'rotate', label: '🔁 หมุนภาพ' },
                  { k: 'color', label: '🎨 ปรับสี/แสง' },
                  { k: 'erase', label: '⬛ สุ่มบังบางส่วน' },
                ] as const).map((o) => (
                  <label key={o.k} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox" disabled={training}
                      checked={augOpts[o.k]}
                      onChange={(e) => setAugOpts((p) => ({ ...p, [o.k]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-emerald-500"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}

            {augOn && augMode === 'offline' && (
              <label className="flex items-center justify-between text-sm pt-1">
                <span className="text-zinc-400">เพิ่มเป็นกี่เท่า</span>
                <select
                  value={augFactor} disabled={training}
                  onChange={(e) => setAugFactor(Number(e.target.value))}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm focus:outline-none focus:border-emerald-500"
                >
                  {[2, 3, 4, 5].map((n) => <option key={n} value={n}>×{n}</option>)}
                </select>
              </label>
            )}

            {/* projected image count / mode note */}
            {augOn && augMode === 'onfly' ? (
              <p className="text-[11px] text-zinc-500 pt-0.5">
                ภาพต้นฉบับ <span className="text-zinc-300 font-medium">{totalImgs}</span> รูป ·
                <span className="text-zinc-500"> On-the-fly ไม่เพิ่มไฟล์ — สุ่มแปลงใหม่ทุก epoch</span>
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500 pt-0.5">
                ภาพต้นฉบับ <span className="text-zinc-300 font-medium">{totalImgs}</span> รูป
                {augOn && totalImgs > 0 && (
                  <> → หลังเพิ่ม ≈ <span className="text-emerald-400 font-medium">{projectedImgs}</span> รูป</>
                )}
              </p>
            )}

            {augOn && augMode === 'offline' && (
              <button
                onClick={generateDataset}
                disabled={genBusy || totalImgs === 0}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600/90 hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {genBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {genBusy ? 'กำลังสร้าง dataset...' : 'เพิ่มความหลากหลาย → โหลด .zip'}
              </button>
            )}
          </div>

          <h2 className="text-sm font-semibold text-zinc-300 pt-2">3. เทรนโมเดล</h2>

          {/* base model (optional) */}
          <div className="border border-zinc-800 rounded-xl p-4 space-y-2 bg-zinc-900/50">
            <div className="text-xs text-zinc-400">
              โมเดลฐาน <span className="text-zinc-600">(ไม่บังคับ)</span>
            </div>
            <ModelUpload
              modelId={proj.base_model_id ?? undefined}
              modelName={proj.base_model_name ?? undefined}
              task="classify"
              onChange={async (v) => { await trainApi.setBaseModel(id, v); await load() }}
            />
            {!proj.base_model_id && (
              <>
                <div className="text-xs text-zinc-400 pt-1">ขนาดโมเดล (YOLO26)</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: 'n', label: 'เล็ก (n)', desc: 'เร็วสุด' },
                    { v: 's', label: 'กลาง (s)', desc: 'แม่นขึ้น' },
                    { v: 'm', label: 'ใหญ่ (m)', desc: 'แม่นสุด·ช้า' },
                  ] as const).map((o) => (
                    <button key={o.v} onClick={() => setModelSize(o.v)} disabled={training}
                      className={`px-2 py-1.5 rounded-lg border text-xs ${modelSize === o.v ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                      {o.label}<span className="block text-[9px] opacity-70">{o.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600">
                  ฐาน: <span className="font-mono text-zinc-500">yolo26{modelSize}-cls.pt</span> — อัปโหลด .pt เพื่อเทรนต่อจากโมเดลของคุณเอง
                </p>
              </>
            )}
          </div>

          <div className="border border-zinc-800 rounded-xl p-4 space-y-3 bg-zinc-900/50">
            <label className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">จำนวนรอบ (epochs)</span>
              <input
                type="number" min={1} max={200} value={epochs}
                onChange={(e) => setEpochs(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                disabled={training}
                className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-right focus:outline-none focus:border-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">
                หยุดเมื่อแม่นยำถึง (%)
                <span className="block text-[10px] text-zinc-600">0 = เทรนจนครบรอบ</span>
              </span>
              <input
                type="number" min={0} max={100} value={targetAcc}
                onChange={(e) => setTargetAcc(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                disabled={training}
                className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-right focus:outline-none focus:border-emerald-500"
              />
            </label>

            {training ? (
              <button
                onClick={stopTrain}
                disabled={stopping}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {stopping ? <Loader2 size={16} className="animate-spin" /> : <Square size={15} />}
                {stopping ? 'กำลังหยุด (จบ epoch นี้)...' : 'หยุดเทรน (เก็บผลล่าสุด)'}
              </button>
            ) : (
              <button
                onClick={startTrain}
                disabled={!canTrain}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} /> เริ่มเทรน
              </button>
            )}

            {!canTrain && !training && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
                <AlertTriangle size={12} /> ต้องมี ≥ 2 คลาส และแต่ละคลาส ≥ 2 รูป
              </p>
            )}

            {training && (
              <div className="space-y-1">
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>epoch {Math.min(proj.progress.epoch, proj.progress.total)}/{proj.progress.total} · {pct}%</span>
                  {proj.progress.accuracy != null && (
                    <span className="text-emerald-400 font-medium">
                      แม่นยำ {Math.round(proj.progress.accuracy * 100)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {proj.status === 'failed' && (
              <p className="text-[11px] text-red-400">ล้มเหลว: {proj.error}</p>
            )}
          </div>

          {/* result */}
          {proj.status === 'done' && proj.model_id && (
            <div className="border border-emerald-600/40 bg-emerald-500/5 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <CheckCircle2 size={16} /> โมเดลพร้อมใช้งาน
              </div>
              {proj.accuracy != null && (
                <p className="text-xs text-zinc-400">ความแม่นยำ (val): <span className="text-emerald-300 font-medium">{Math.round(proj.accuracy * 100)}%</span></p>
              )}
              {proj.per_class && Object.keys(proj.per_class).length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] text-zinc-500">ความแม่นรายคลาส — คลาสที่ต่ำ = ควรเพิ่มรูปคลาสนั้น</div>
                  {Object.entries(proj.per_class).map(([cls, r]) => {
                    const pctC = r.total > 0 ? r.correct / r.total : 0
                    return (
                      <div key={cls} className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-300 w-24 truncate">{cls}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${pctC >= 0.8 ? 'bg-emerald-500' : pctC >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.round(pctC * 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 w-14 text-right">{r.correct}/{r.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {!!proj.mistakes?.length && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] text-zinc-500">ตัวอย่างที่ทายผิด (เฉลย → AI ทาย)</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {proj.mistakes.map((m, i) => {
                      const u = mistakeUrls[`${m.true}/${m.file}`]
                      return (
                        <div key={i} className="space-y-0.5">
                          {u ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={u} alt={m.file} className="w-full aspect-square object-cover rounded border border-red-500/40" />
                          ) : (
                            <div className="w-full aspect-square rounded border border-zinc-800 bg-zinc-800/50" />
                          )}
                          <div className="text-[9px] leading-tight text-zinc-500 truncate" title={`${m.true} → ${m.pred}`}>
                            <span className="text-emerald-400">{m.true}</span> → <span className="text-red-400">{m.pred}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-xs text-zinc-400">
                ใช้ใน block <span className="text-violet-300 font-medium">DeepClassifier</span> →
                เลือก &quot;{proj.model_name}&quot; จากรายการโมเดลที่เทรนไว้
              </p>
              <button
                onClick={download}
                className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-200"
              >
                <Download size={15} /> ดาวน์โหลดโมเดล (.pt)
              </button>
              <button
                onClick={openTest}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold"
              >
                <FlaskConical size={15} /> ทดสอบโมเดล
              </button>
            </div>
          )}
        </div>
        </div>

        {/* status bar — what's happening right now */}
        {(training || proj.stage) && (
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur px-6 py-3">
            <div className="max-w-5xl mx-auto flex items-center gap-2 text-sm text-zinc-200">
              <Loader2 size={15} className="animate-spin text-emerald-400" />
              <span>{proj.stage ?? 'กำลังทำงาน...'}</span>
              {training && proj.progress.accuracy != null && (
                <span className="ml-auto text-emerald-400 font-medium">
                  แม่นยำ {Math.round(proj.progress.accuracy * 100)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* model tester */}
        {testOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeTest}>
            <div className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-2.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><FlaskConical size={15} className="text-emerald-400" /> ทดสอบโมเดล</h3>
                <button onClick={closeTest} className="p-1 hover:bg-zinc-800 rounded text-zinc-400"><X size={15} /></button>
              </div>

              <video ref={testVideoRef} className={`w-full max-h-44 object-contain rounded-lg border border-zinc-800 ${testCam ? '' : 'hidden'}`} muted playsInline />
              {testImg && !testCam && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={testImg} alt="test" className="w-full max-h-44 object-contain rounded-lg border border-zinc-800" />
              )}

              <div className="flex flex-wrap gap-1.5">
                {!testCam ? (
                  <button onClick={startTestCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"><Camera size={14} /> เปิดกล้อง</button>
                ) : (
                  <>
                    <button onClick={snapTest} disabled={testBusy} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm disabled:opacity-50"><Aperture size={14} /> ถ่าย+ทดสอบ</button>
                    <button onClick={stopTestCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"><CameraOff size={14} /> ปิด</button>
                  </>
                )}
                <button onClick={() => testFileRef.current?.click()} disabled={testBusy} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-50"><Upload size={14} /> อัปโหลด</button>
                <input ref={testFileRef} type="file" accept="image/*" onChange={onTestFile} className="hidden" />
              </div>

              {testBusy && <div className="text-sm text-zinc-400 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> กำลังทำนาย...</div>}
              {testResult && (
                <div className="border-t border-zinc-800 pt-3 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-emerald-400">{testResult.label}</span>
                    <span className="text-xs text-zinc-500">{Math.round(testResult.confidence * 100)}%</span>
                  </div>
                  {testResult.top5.slice(0, 3).map((t) => (
                    <div key={t.label} className="space-y-0.5">
                      <div className="flex justify-between text-[11px] text-zinc-400"><span>{t.label}</span><span>{Math.round(t.confidence * 100)}%</span></div>
                      <div className="h-1.5 bg-zinc-800 rounded"><div className="h-full bg-emerald-500 rounded" style={{ width: `${t.confidence * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
