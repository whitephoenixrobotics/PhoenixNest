'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Camera, CameraOff, Upload, Plus, Loader2, Play, Square,
  CheckCircle2, AlertTriangle, Aperture, Sparkles, Save, Download, X, FlaskConical,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { trainApi, trainDetApi } from '@/lib/api-client'
import { ModelUpload } from '@/components/nodes/dl/ModelUpload'

interface Box { cls: number; cx: number; cy: number; w: number; h: number; hint?: string }
interface ImgItem { id: string; annotated: boolean; boxes: Box[] }
interface Project {
  id: string; name: string
  status: 'draft' | 'training' | 'done' | 'failed'
  progress: { epoch: number; total: number; accuracy?: number | null }
  stage?: string | null
  det_classes: string[]
  images: ImgItem[]
  accuracy?: number | null
  per_class?: Record<string, number>
  autolabel?: { running: boolean; done: number; total: number; labeled: number }
  aug_mode?: string | null
  base_model_id?: string | null
  base_model_name?: string | null
  model_id?: string | null
  model_name?: string | null
  error?: string | null
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

// COCO-80 — what the batch auto-label model (yolo26s) can recognize
const COCO = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
  'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
  'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]

// Common Thai names → COCO, so the mapping pre-fills itself for typical classes
const THAI_COCO: Record<string, string> = {
  'คน': 'person', 'หมา': 'dog', 'สุนัข': 'dog', 'แมว': 'cat', 'นก': 'bird', 'ม้า': 'horse',
  'วัว': 'cow', 'ช้าง': 'elephant', 'รถ': 'car', 'รถยนต์': 'car', 'มอเตอร์ไซค์': 'motorcycle',
  'จักรยาน': 'bicycle', 'รถบัส': 'bus', 'บัส': 'bus', 'รถบรรทุก': 'truck', 'เรือ': 'boat',
  'ขวด': 'bottle', 'แก้ว': 'cup', 'ถ้วย': 'cup', 'เก้าอี้': 'chair', 'โต๊ะ': 'dining table',
  'ทีวี': 'tv', 'โน้ตบุ๊ค': 'laptop', 'มือถือ': 'cell phone', 'โทรศัพท์': 'cell phone',
  'หนังสือ': 'book', 'นาฬิกา': 'clock', 'กรรไกร': 'scissors', 'ตุ๊กตาหมี': 'teddy bear',
}

const guessCoco = (cls: string): string => {
  const t = cls.trim().toLowerCase()
  if (COCO.includes(t)) return t
  return THAI_COCO[cls.trim()] ?? ''
}
const readDataURL = (f: File) => new Promise<string>((res) => {
  const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f)
})

export default function DetectTrainPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [proj, setProj] = useState<Project | null>(null)
  const [classes, setClasses] = useState<string[]>([])
  const [newClass, setNewClass] = useState('')
  const [activeCls, setActiveCls] = useState(0)
  const [sel, setSel] = useState<string | null>(null)          // selected image id
  const [boxes, setBoxes] = useState<Box[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [camOn, setCamOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchMap, setBatchMap] = useState<Record<number, string>>({})   // project class idx → COCO name
  const [batchOverwrite, setBatchOverwrite] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [epochs, setEpochs] = useState(50)
  const [targetAcc, setTargetAcc] = useState(0)
  const [modelSize, setModelSize] = useState<'n' | 's' | 'm'>('n')
  const [augOn, setAugOn] = useState(false)
  const [augMode, setAugMode] = useState<'offline' | 'onfly'>('onfly')
  const [augOpts, setAugOpts] = useState({ flip: true, rotate: true, color: true, erase: false })
  const [augFactor, setAugFactor] = useState(3)
  const [genBusy, setGenBusy] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testCam, setTestCam] = useState(false)
  const [testRes, setTestRes] = useState<{ image: string; count: number; classes: string[] } | null>(null)
  const testVideoRef = useRef<HTMLVideoElement>(null)
  const testStreamRef = useRef<MediaStream | null>(null)
  const testFileRef = useRef<HTMLInputElement>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const draw = useRef<{ x: number; y: number } | null>(null)
  const [temp, setTemp] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const load = useCallback(async () => {
    const res = await trainDetApi.get(id)
    setProj(res.data)
    setClasses(res.data.det_classes ?? [])
  }, [id])

  useEffect(() => {
    // Auth is handled by the axios interceptor (401 → /login). No localStorage check.
    let alive = true
    trainDetApi.get(id)
      .then((res) => { if (alive) { setProj(res.data); setClasses(res.data.det_classes ?? []) } })
      .catch(() => router.push('/'))
    return () => { alive = false }
  }, [id, router])

  // Poll while training or while batch auto-label runs
  useEffect(() => {
    if (proj?.status !== 'training' && !proj?.autolabel?.running) return
    const t = setInterval(() => { trainDetApi.get(id).then((r) => setProj(r.data)).catch(() => {}) }, 1500)
    return () => clearInterval(t)
  }, [proj?.status, proj?.autolabel?.running, id])

  // Fetch blob URLs for any images we don't have yet
  useEffect(() => {
    if (!proj) return
    for (const im of proj.images) {
      if (urls[im.id]) continue
      trainDetApi.image(id, im.id).then((r) => {
        const u = URL.createObjectURL(r.data as Blob)
        setUrls((prev) => (prev[im.id] ? prev : { ...prev, [im.id]: u }))
      }).catch(() => {})
    }
  }, [proj, id, urls])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    testStreamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // ── camera / upload ──
  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play() }
      setCamOn(true)
    } catch { alert('เปิดกล้องไม่ได้') }
  }
  const stopCam = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setCamOn(false) }
  const snap = async () => {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    await addImages([c.toDataURL('image/jpeg', 0.9)])
  }
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    await addImages(await Promise.all(files.map(readDataURL)))
    if (fileRef.current) fileRef.current.value = ''
  }
  const addImages = async (imgs: string[]) => {
    setSaving(true)
    try { await trainDetApi.addImages(id, imgs); await load() } finally { setSaving(false) }
  }

  // ── classes ──
  const syncClasses = async (next: string[]) => {
    setClasses(next)
    await trainDetApi.setClasses(id, next)
    await load()
  }
  const addClass = async () => {
    const n = newClass.trim()
    if (!n || classes.includes(n)) return
    setNewClass('')
    await syncClasses([...classes, n])
  }
  const removeClass = async (i: number) => {
    if (!confirm(`ลบคลาส "${classes[i]}"? (กรอบที่ตีไว้ของคลาสนี้อาจคลาดเคลื่อน)`)) return
    await syncClasses(classes.filter((_, idx) => idx !== i))
    if (activeCls >= classes.length - 1) setActiveCls(0)
  }

  // ── annotation ──
  const openImage = (im: ImgItem) => { setSel(im.id); setBoxes(im.boxes.map((b) => ({ ...b }))) }
  const closeImage = () => { setSel(null); setBoxes([]); setTemp(null) }

  const relPoint = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }
  const onDown = (e: React.PointerEvent) => {
    if (classes.length === 0) { alert('เพิ่มคลาสก่อน'); return }
    const p = relPoint(e); draw.current = p; setTemp({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!draw.current) return
    const p = relPoint(e); setTemp({ x1: draw.current.x, y1: draw.current.y, x2: p.x, y2: p.y })
  }
  const onUp = () => {
    if (!draw.current || !temp) { draw.current = null; return }
    const w = Math.abs(temp.x2 - temp.x1), h = Math.abs(temp.y2 - temp.y1)
    if (w > 0.02 && h > 0.02) {
      setBoxes((prev) => [...prev, {
        cls: activeCls, w, h,
        cx: (temp.x1 + temp.x2) / 2, cy: (temp.y1 + temp.y2) / 2,
      }])
    }
    draw.current = null; setTemp(null)
  }

  const aiAssist = async () => {
    if (!sel) return
    setAiBusy(true)
    try {
      const res = await trainDetApi.autolabel(id, sel)
      const proposed: Box[] = (res.data.boxes ?? []).map((b: Box) => ({ ...b, cls: activeCls }))
      setBoxes((prev) => [...prev, ...proposed])
    } finally { setAiBusy(false) }
  }

  const saveBoxes = async () => {
    if (!sel) return
    setSaving(true)
    try { await trainDetApi.annotations(id, sel, boxes); await load() } finally { setSaving(false) }
  }

  // Move to prev/next image, auto-saving the current boxes first
  const goRelative = async (delta: number) => {
    if (!sel || !proj) return
    const idx = proj.images.findIndex((i) => i.id === sel)
    const ni = idx + delta
    if (idx < 0 || ni < 0 || ni >= proj.images.length) return
    const next = proj.images[ni]
    try { await trainDetApi.annotations(id, sel, boxes) } catch { /* ignore */ }
    setSel(next.id); setBoxes(next.boxes.map((b) => ({ ...b }))); setTemp(null)
    await load()
  }

  // ── train ──
  const openBatch = () => {
    // Pre-fill the mapping for class names the model already knows
    const map: Record<number, string> = {}
    classes.forEach((c, i) => { map[i] = guessCoco(c) })
    setBatchMap(map)
    setBatchOpen(true)
  }

  const startBatch = async () => {
    const mapping: Record<string, number> = {}
    for (const [idx, coco] of Object.entries(batchMap)) {
      if (coco) mapping[coco] = Number(idx)
    }
    if (!Object.keys(mapping).length) { alert('จับคู่คลาสอย่างน้อย 1 คู่ก่อน'); return }
    setBatchBusy(true)
    try {
      await trainDetApi.autolabelAll(id, mapping, batchOverwrite)
      setBatchOpen(false)
      await load()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'เริ่มไม่สำเร็จ')
    } finally {
      setBatchBusy(false)
    }
  }

  const startTrain = async () => {
    try {
      setStopping(false)
      await trainDetApi.train(id, epochs, targetAcc > 0 ? targetAcc / 100 : undefined, augOn ? { ...augOpts, mode: augMode, factor: augFactor } : null, modelSize)
      await load()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'เริ่มเทรนไม่สำเร็จ')
    }
  }
  const stopTrain = async () => { setStopping(true); try { await trainApi.stop(id) } catch { /* ignore */ } }
  const saveBlob = (data: Blob, filename: string) => {
    const u = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = u; a.download = filename; a.click()
    URL.revokeObjectURL(u)
  }
  const download = async () => {
    const res = await trainApi.download(id)
    saveBlob(res.data as Blob, proj?.model_name || 'model.pt')
  }
  const generateDataset = async () => {
    setGenBusy(true)
    try {
      const res = await trainDetApi.augmentDataset(id, { ...augOpts, factor: augFactor })
      saveBlob(res.data as Blob, `${proj?.name || 'dataset'}_augmented.zip`)
    } catch {
      alert('สร้าง dataset ไม่สำเร็จ — ต้องตีกรอบอย่างน้อย 1 รูปก่อน')
    } finally {
      setGenBusy(false)
    }
  }

  // ── model tester ──
  const runPredict = async (dataURL: string) => {
    setTestRes(null); setTestBusy(true)
    try {
      const r = await trainDetApi.predict(id, dataURL)
      setTestRes(r.data)
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      alert(ax.response?.data?.detail ?? 'ทดสอบไม่สำเร็จ')
    } finally { setTestBusy(false) }
  }
  const openTest = () => { setTestOpen(true); setTestRes(null) }
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
    const data = c.toDataURL('image/jpeg', 0.9)
    stopTestCam()                 // stop so the annotated result image shows
    runPredict(data)
  }
  const onTestFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) runPredict(await readDataURL(f))
    if (testFileRef.current) testFileRef.current.value = ''
  }

  // Keyboard shortcuts: A = AI auto-label, ←/→ = prev/next image (auto-save)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !sel) return
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); aiAssist() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goRelative(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goRelative(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, boxes, proj, activeCls])

  if (!proj) {
    return <div className="min-h-screen bg-zinc-950 flex items-center gap-2 justify-center text-zinc-400"><Loader2 className="animate-spin" size={18} /> Loading...</div>
  }

  const annotated = proj.images.filter((i) => i.annotated).length
  const selIdx = sel ? proj.images.findIndex((i) => i.id === sel) : -1
  const training = proj.status === 'training'
  const canTrain = classes.length >= 1 && annotated >= 3
  const pct = proj.progress.total ? Math.min(100, Math.round((Math.min(proj.progress.epoch, proj.progress.total) / proj.progress.total) * 100)) : 0
  const tb = temp ? { left: `${Math.min(temp.x1, temp.x2) * 100}%`, top: `${Math.min(temp.y1, temp.y2) * 100}%`, width: `${Math.abs(temp.x2 - temp.x1) * 100}%`, height: `${Math.abs(temp.y2 - temp.y1) * 100}%` } : null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100"><ArrowLeft size={18} /></button>
        <Logo size={24} />
        <div className="flex-1"><h1 className="text-base font-bold text-white leading-tight">{proj.name}</h1><p className="text-[11px] text-zinc-500">TrainAI · ตรวจจับวัตถุ</p></div>
      </header>

      <main className="p-6 max-w-6xl mx-auto pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: classes + images */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">1. คลาส & รูปภาพ</h2>

            {/* classes */}
            <div className="flex gap-2">
              <input value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClass()}
                placeholder="ชื่อคลาส เช่น แมว" className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
              <button onClick={addClass} className="flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium"><Plus size={14} /> เพิ่ม</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c, i) => (
                <span key={c} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs border" style={{ borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }}>
                  {c}
                  <button onClick={() => removeClass(i)} className="hover:text-red-400 text-zinc-500"><X size={11} /></button>
                </span>
              ))}
              {classes.length === 0 && <span className="text-xs text-zinc-600 italic">เพิ่มอย่างน้อย 1 คลาส</span>}
            </div>

            {/* add images */}
            <div className="border border-zinc-800 rounded-xl p-3 space-y-2 bg-zinc-900/50">
              <video ref={videoRef} className={`w-full rounded-lg border border-zinc-800 ${camOn ? '' : 'hidden'}`} muted playsInline />
              <div className="flex flex-wrap gap-2">
                {!camOn ? (
                  <button onClick={startCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"><Camera size={14} /> เปิดกล้อง</button>
                ) : (
                  <>
                    <button onClick={snap} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm disabled:opacity-50"><Aperture size={14} /> ถ่าย</button>
                    <button onClick={stopCam} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"><CameraOff size={14} /> ปิด</button>
                  </>
                )}
                <button onClick={() => fileRef.current?.click()} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-50"><Upload size={14} /> อัปโหลด</button>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} className="hidden" />
              </div>
            </div>

            {/* gallery */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500">รูป {proj.images.length} · ตีกรอบแล้ว {annotated}</div>
              {!proj.autolabel?.running && proj.images.length > 0 && classes.length > 0 && (
                <button onClick={openBatch}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 rounded-md text-[11px] text-amber-300">
                  <Sparkles size={11} /> AI ตีกรอบทั้งหมด
                </button>
              )}
            </div>
            {proj.autolabel?.running && (
              <div className="space-y-1">
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all"
                    style={{ width: `${proj.autolabel.total ? Math.round((proj.autolabel.done / proj.autolabel.total) * 100) : 0}%` }} />
                </div>
                <div className="text-[11px] text-amber-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  AI กำลังตีกรอบ {proj.autolabel.done}/{proj.autolabel.total} · ติดกรอบแล้ว {proj.autolabel.labeled} รูป
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {proj.images.map((im) => (
                <button key={im.id} onClick={() => openImage(im)}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 ${sel === im.id ? 'border-amber-500' : im.annotated ? 'border-emerald-600/60' : 'border-zinc-700'}`}>
                  {urls[im.id]
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={urls[im.id]} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center bg-zinc-800"><Loader2 size={14} className="animate-spin text-zinc-600" /></div>}
                  {im.annotated && <span className="absolute top-0.5 right-0.5 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={10} /></span>}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT: annotate + train */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">2. ตีกรอบ</h2>
            {sel && urls[sel] ? (
              <div className="space-y-2">
                {/* class picker */}
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c, i) => (
                    <button key={c} onClick={() => setActiveCls(i)}
                      className="px-2 py-1 rounded-md text-xs border-2 transition-all"
                      style={{ borderColor: COLORS[i % COLORS.length], background: activeCls === i ? COLORS[i % COLORS.length] : 'transparent', color: activeCls === i ? '#000' : COLORS[i % COLORS.length] }}>
                      {c}
                    </button>
                  ))}
                </div>

                {/* canvas */}
                <div ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
                  className="relative w-full select-none rounded-lg overflow-hidden border border-zinc-700 touch-none cursor-crosshair">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[sel]} alt="annotate" className="w-full block pointer-events-none" draggable={false} />
                  {boxes.map((b, i) => (
                    <div key={i} className="absolute border-2 group" style={{
                      left: `${(b.cx - b.w / 2) * 100}%`, top: `${(b.cy - b.h / 2) * 100}%`,
                      width: `${b.w * 100}%`, height: `${b.h * 100}%`, borderColor: COLORS[b.cls % COLORS.length],
                    }}>
                      <span className="absolute -top-4 left-0 text-[10px] px-1 rounded text-black" style={{ background: COLORS[b.cls % COLORS.length] }}>{classes[b.cls] ?? '?'}</span>
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                        onClick={(e) => { e.stopPropagation(); setBoxes((p) => p.filter((_, idx) => idx !== i)) }}
                        className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 pointer-events-auto"><X size={10} /></button>
                    </div>
                  ))}
                  {tb && <div className="absolute border-2 border-dashed" style={{ ...tb, borderColor: COLORS[activeCls % COLORS.length] }} />}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={aiAssist} disabled={aiBusy} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm disabled:opacity-50">
                    {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI ช่วยตีกรอบ
                  </button>
                  <button onClick={saveBoxes} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} บันทึก ({boxes.length})
                  </button>
                  <button onClick={closeImage} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">ปิด</button>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => goRelative(-1)} disabled={selIdx <= 0} className="px-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-40">◀</button>
                    <span className="text-xs text-zinc-500 tabular-nums">{selIdx + 1}/{proj.images.length}</span>
                    <button onClick={() => goRelative(1)} disabled={selIdx >= proj.images.length - 1} className="px-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-40">▶</button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600">
                  ลากเมาส์ตีกรอบ · เลือกคลาสก่อนวาด · ทางลัด: <span className="text-zinc-400 font-medium">A</span> = AI ตีกรอบ, <span className="text-zinc-400 font-medium">←/→</span> = เปลี่ยนรูป (บันทึกอัตโนมัติ)
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-600 italic border border-dashed border-zinc-800 rounded-xl py-8 text-center">เลือกรูปจากแกลเลอรีเพื่อเริ่มตีกรอบ</p>
            )}

            {/* augmentation */}
            <h2 className="text-sm font-semibold text-zinc-300 pt-2">3. Augmentation</h2>
            <div className="border border-zinc-800 rounded-xl p-4 space-y-2 bg-zinc-900/50">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-zinc-300">เพิ่มความหลากหลายข้อมูล</span>
                  <span className="block text-[10px] text-zinc-600">พลิก/หมุน/ปรับสี — กรอบขยับตามภาพอัตโนมัติ</span>
                </div>
                <input type="checkbox" checked={augOn} disabled={training} onChange={(e) => setAugOn(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              </label>
              {augOn && (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setAugMode('onfly')} disabled={training} className={`px-2 py-1.5 rounded-lg border text-xs ${augMode === 'onfly' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>On-the-fly (สุ่มตอนเทรน)</button>
                    <button onClick={() => setAugMode('offline')} disabled={training} className={`px-2 py-1.5 rounded-lg border text-xs ${augMode === 'offline' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>Offline (เพิ่มไฟล์จริง)</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {([
                      { k: 'flip', label: '🔄 พลิกซ้าย-ขวา' },
                      { k: 'rotate', label: '🔁 หมุนภาพ' },
                      { k: 'color', label: '🎨 ปรับสี/แสง' },
                      { k: 'erase', label: '⬛ สุ่มบังบางส่วน' },
                      // ultralytics implements random-erasing only in its classification
                      // pipeline — for detect training it's silently ignored, so the
                      // switch is offered only in offline mode (our own augmenter).
                    ] as const).filter((o) => o.k !== 'erase' || augMode === 'offline').map((o) => (
                      <label key={o.k} className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                        <input type="checkbox" disabled={training} checked={augOpts[o.k]} onChange={(e) => setAugOpts((p) => ({ ...p, [o.k]: e.target.checked }))} className="w-3.5 h-3.5 accent-amber-500" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  {augMode === 'offline' && (
                    <label className="flex items-center justify-between text-sm pt-1">
                      <span className="text-zinc-400">เพิ่มเป็นกี่เท่า</span>
                      <select value={augFactor} disabled={training} onChange={(e) => setAugFactor(Number(e.target.value))} className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm focus:outline-none focus:border-amber-500">
                        {[2, 3, 4, 5].map((n) => <option key={n} value={n}>×{n}</option>)}
                      </select>
                    </label>
                  )}
                  {augMode === 'onfly' ? (
                    <p className="text-[11px] text-zinc-500">ตีกรอบแล้ว <span className="text-zinc-300 font-medium">{annotated}</span> รูป · On-the-fly ไม่เพิ่มไฟล์</p>
                  ) : (
                    <p className="text-[11px] text-zinc-500">ตีกรอบแล้ว <span className="text-zinc-300 font-medium">{annotated}</span> รูป → หลังเพิ่ม ≈ <span className="text-amber-400 font-medium">{annotated * augFactor}</span> รูป</p>
                  )}
                  {augMode === 'offline' && (
                    <button onClick={generateDataset} disabled={genBusy || annotated === 0} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600/90 hover:bg-amber-500 rounded-lg text-sm font-medium disabled:opacity-50">
                      {genBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      {genBusy ? 'กำลังสร้าง dataset...' : 'เพิ่มความหลากหลาย → โหลด .zip'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* train */}
            <h2 className="text-sm font-semibold text-zinc-300 pt-2">4. เทรนโมเดล</h2>

            {/* base model (optional) */}
            <div className="border border-zinc-800 rounded-xl p-4 space-y-2 bg-zinc-900/50">
              <div className="text-xs text-zinc-400">โมเดลฐาน <span className="text-zinc-600">(ไม่บังคับ)</span></div>
              <ModelUpload
                modelId={proj.base_model_id ?? undefined}
                modelName={proj.base_model_name ?? undefined}
                task="detect"
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
                        className={`px-2 py-1.5 rounded-lg border text-xs ${modelSize === o.v ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                        {o.label}<span className="block text-[9px] opacity-70">{o.desc}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600">
                    ฐาน: <span className="font-mono text-zinc-500">yolo26{modelSize}.pt</span> — อัปโหลด .pt เพื่อเทรนต่อจากโมเดลของคุณเอง
                  </p>
                </>
              )}
            </div>

            <div className="border border-zinc-800 rounded-xl p-4 space-y-3 bg-zinc-900/50">
              <label className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">จำนวนรอบ (epochs)</span>
                <input type="number" min={1} max={300} value={epochs} disabled={training}
                  onChange={(e) => setEpochs(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                  className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-right focus:outline-none focus:border-amber-500" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">หยุดเมื่อ mAP ถึง (%)<span className="block text-[10px] text-zinc-600">0 = เทรนจนครบรอบ</span></span>
                <input type="number" min={0} max={100} value={targetAcc} disabled={training}
                  onChange={(e) => setTargetAcc(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-right focus:outline-none focus:border-amber-500" />
              </label>

              {training ? (
                <button onClick={stopTrain} disabled={stopping} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold disabled:opacity-60">
                  {stopping ? <Loader2 size={16} className="animate-spin" /> : <Square size={15} />} {stopping ? 'กำลังหยุด...' : 'หยุดเทรน (เก็บผลล่าสุด)'}
                </button>
              ) : (
                <button onClick={startTrain} disabled={!canTrain} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                  <Play size={16} /> เริ่มเทรน
                </button>
              )}
              {!canTrain && !training && <p className="flex items-center gap-1.5 text-[11px] text-amber-400"><AlertTriangle size={12} /> ต้องมี ≥ 1 คลาส และตีกรอบ ≥ 3 รูป</p>}

              {training && (
                <div className="space-y-1">
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>epoch {Math.min(proj.progress.epoch, proj.progress.total)}/{proj.progress.total} · {pct}%</span>
                    {proj.progress.accuracy != null && <span className="text-amber-400 font-medium">mAP {Math.round(proj.progress.accuracy * 100)}%</span>}
                  </div>
                </div>
              )}
              {proj.status === 'failed' && <p className="text-[11px] text-red-400">ล้มเหลว: {proj.error}</p>}
            </div>

            {proj.status === 'done' && proj.model_id && (
              <div className="border border-amber-600/40 bg-amber-500/5 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm"><CheckCircle2 size={16} /> โมเดลพร้อมใช้งาน</div>
                {proj.accuracy != null && <p className="text-xs text-zinc-400">mAP50: <span className="text-amber-300 font-medium">{Math.round(proj.accuracy * 100)}%</span></p>}
                {proj.per_class && Object.keys(proj.per_class).length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] text-zinc-500">ความแม่นรายคลาส (mAP50) — คลาสที่ต่ำ = ควรเพิ่มรูป/ตีกรอบเพิ่ม</div>
                    {Object.entries(proj.per_class).map(([cls, ap]) => (
                      <div key={cls} className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-300 w-24 truncate">{cls}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${ap >= 0.7 ? 'bg-emerald-500' : ap >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.round(ap * 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 w-9 text-right">{Math.round(ap * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-zinc-400">ใช้ใน block <span className="text-violet-300 font-medium">DeepDetect</span> → เลือก &quot;{proj.model_name}&quot;</p>
                <button onClick={download} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-200"><Download size={15} /> ดาวน์โหลดโมเดล (.pt)</button>
                <button onClick={openTest} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold"><FlaskConical size={15} /> ทดสอบโมเดล</button>
              </div>
            )}
          </div>
        </div>

        {(training || proj.stage) && (
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur px-6 py-3">
            <div className="max-w-6xl mx-auto flex items-center gap-2 text-sm text-zinc-200">
              <Loader2 size={15} className="animate-spin text-amber-400" />
              <span>{proj.stage ?? 'กำลังทำงาน...'}</span>
              {training && proj.progress.accuracy != null && <span className="ml-auto text-amber-400 font-medium">mAP {Math.round(proj.progress.accuracy * 100)}%</span>}
            </div>
          </div>
        )}

        {/* batch auto-label: map project classes ↔ what the AI knows */}
        {batchOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setBatchOpen(false)}>
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><Sparkles size={15} className="text-amber-400" /> AI ตีกรอบทั้งหมด</h3>
                <button onClick={() => setBatchOpen(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400"><X size={15} /></button>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                จับคู่คลาสของคุณกับสิ่งที่ AI รู้จัก (COCO-80) แล้ว AI จะตีกรอบให้ทุกรูปที่ยังไม่ได้ตีกรอบ — เปิดสุ่มตรวจ/แก้ทีหลังได้
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {classes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs w-24 truncate" style={{ color: COLORS[i % COLORS.length] }}>{c}</span>
                    <span className="text-zinc-600 text-xs">→</span>
                    <select value={batchMap[i] ?? ''} onChange={(e) => setBatchMap((p) => ({ ...p, [i]: e.target.value }))}
                      className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-amber-500">
                      <option value="">— ไม่จับคู่ (ข้าม) —</option>
                      {COCO.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" />
                ตีกรอบทับรูปที่ตีไว้แล้วด้วย (ค่าเริ่มต้น: ข้ามรูปที่ทำแล้ว)
              </label>
              <button onClick={startBatch} disabled={batchBusy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold disabled:opacity-50">
                {batchBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} เริ่มตีกรอบอัตโนมัติ
              </button>
              <p className="text-[10px] text-zinc-600">
                ของที่ AI ไม่รู้จัก (ไม่อยู่ใน 80 ชนิด) ให้ตีกรอบเอง ~100 รูปแล้วเทรน จากนั้นใช้โมเดลที่ได้เป็นฐานเทรนรอบถัดไป
              </p>
            </div>
          </div>
        )}

        {/* model tester */}
        {testOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeTest}>
            <div className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-2.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><FlaskConical size={15} className="text-amber-400" /> ทดสอบโมเดล</h3>
                <button onClick={closeTest} className="p-1 hover:bg-zinc-800 rounded text-zinc-400"><X size={15} /></button>
              </div>

              <video ref={testVideoRef} className={`w-full max-h-44 object-contain rounded-lg border border-zinc-800 ${testCam ? '' : 'hidden'}`} muted playsInline />
              {testRes?.image && !testCam && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={testRes.image} alt="result" className="w-full max-h-44 object-contain rounded-lg border border-zinc-800" />
              )}

              <div className="flex flex-wrap gap-1.5">
                {!testCam ? (
                  <button onClick={startTestCam} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs"><Camera size={13} /> เปิดกล้อง</button>
                ) : (
                  <>
                    <button onClick={snapTest} disabled={testBusy} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs disabled:opacity-50"><Aperture size={13} /> ถ่าย+ทดสอบ</button>
                    <button onClick={stopTestCam} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs"><CameraOff size={13} /> ปิด</button>
                  </>
                )}
                <button onClick={() => testFileRef.current?.click()} disabled={testBusy} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs disabled:opacity-50"><Upload size={13} /> อัปโหลด</button>
                <input ref={testFileRef} type="file" accept="image/*" onChange={onTestFile} className="hidden" />
              </div>

              {testBusy && <div className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> กำลังตรวจจับ...</div>}
              {testRes && !testBusy && (
                <div className="text-xs text-zinc-300 border-t border-zinc-800 pt-2">
                  พบ <span className="text-amber-400 font-medium">{testRes.count}</span> วัตถุ
                  {testRes.classes.length > 0 && <span className="text-zinc-500"> · {testRes.classes.join(', ')}</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
