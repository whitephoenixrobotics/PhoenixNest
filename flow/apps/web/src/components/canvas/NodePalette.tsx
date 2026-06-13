'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { GateSymbol } from '@/components/nodes/logic_gate/GateSymbols'
import { BlockIcon, CategoryIcon } from '@/components/nodes/BlockIcons'
import { ExtensionsButton } from '@/components/extensions/ExtensionsButton'
import { useExtensionsStore, TOGGLEABLE_CATEGORIES } from '@/stores/extensionsStore'
import { ProjectCard } from './ProjectCard'
import type { BlockCategory } from '@/types'

interface NodePaletteProps {
  flowName?: string
  onRename?: (next: string) => void
}

// Add block definitions here as we build them.
// Each block: { type, label, description, icon, defaultConfig }
const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    label: 'Input',
    icon: '📥',
    blocks: [
      {
        type: 'image_upload',
        label: 'Upload ภาพ/วิดีโอ',
        description: 'อัปโหลดภาพ หรือวิดีโอ (เล่น+ประมวลผลทุกเฟรม)',
        icon: '🖼️',
        defaultConfig: { image: '', filename: '', mime: '' },
      },
      {
        type: 'webcam_capture',
        label: 'Webcam',
        description: 'ถ่ายภาพจากกล้อง',
        icon: '📷',
        defaultConfig: { image: '', mime: '' },
      },
      {
        type: 'text_input',
        label: 'Text',
        description: 'พิมพ์ข้อความใน block',
        icon: '📝',
        defaultConfig: { text: '' },
      },
      {
        type: 'switch',
        label: 'Switch',
        description: 'สวิตช์เปิด/ปิด True/False',
        icon: '🎚️',
        defaultConfig: { on: false },
      },
      {
        type: 'button',
        label: 'Button',
        description: 'ปุ่มกดชั่วคราว (True ตอนกด)',
        icon: '🔘',
        defaultConfig: { pressed: false },
      },
      {
        type: 'hotkey',
        label: 'Hotkey',
        description: 'ปุ่มลัดบนคีย์บอร์ด',
        icon: '⌨️',
        defaultConfig: { key: 'Space', pressed: false },
      },
      {
        type: 'speech_to_text',
        label: 'Speech to Text',
        description: 'พูด → ข้อความ',
        icon: '🎙️',
        defaultConfig: { transcript: '', lang: 'th-TH' },
      },
      {
        type: 'color_picker',
        label: 'Color',
        description: 'เลือกสี → RGB',
        icon: '🎨',
        defaultConfig: { color: '#7c3aed' },
      },
      {
        type: 'http_fetch',
        label: 'HTTP Fetch',
        description: 'ดึงข้อมูลจาก URL',
        icon: '🔗',
        defaultConfig: { url: '', fetch_token: 0 },
      },
      {
        type: 'draw_pad',
        label: 'วาดรูป',
        description: 'วาดภาพด้วยเมาส์ → ส่งเป็นภาพ',
        icon: '🖌️',
        defaultConfig: { image: '' },
      },
    ],
  },
  {
    label: 'ข้อมูล',
    icon: '🔍',
    blocks: [
      {
        type: 'json_extract',
        label: 'JSON Extract',
        description: 'ดึงค่าจาก JSON ตาม path',
        icon: '🔍',
        defaultConfig: { path: '', template: '' },
      },
      {
        type: 'data_table',
        label: 'ตารางข้อมูล',
        description: 'เก็บข้อมูลเป็นตาราง ตั้งหัวข้อ + ดึงจากบล็อกอื่น',
        icon: '📊',
        defaultConfig: { columns: [{ header: '' }, { header: '' }], rows: [] },
      },
      {
        type: 'table_read',
        label: 'อ่านจากตาราง',
        description: 'อ่านค่าจากตาราง เลือกคอลัมน์/แถว/ชนิด → ใช้ต่อกับ If ฯลฯ',
        icon: '📑',
        defaultConfig: { column: '', row: 'last', rowIndex: 0, type: 'text' },
      },
      {
        type: 'aggregate',
        label: 'สรุปตาราง',
        description: 'min/max/avg/sum/count/last ของคอลัมน์',
        icon: '∑',
        defaultConfig: { op: 'avg', column: '' },
      },
      {
        type: 'filter',
        label: 'กรองตาราง',
        description: 'กรองแถวตามเงื่อนไข เช่น PM > 50',
        icon: '🔎',
        defaultConfig: { column: '', operator: '>', value: '' },
      },
      {
        type: 'join_text',
        label: 'รวมข้อความ',
        description: 'รวมหลาย input เป็นบรรทัดเดียวด้วย template',
        icon: '🧩',
        defaultConfig: { template: '' },
      },
      {
        type: 'sheets_write',
        label: 'เขียนลง Sheets',
        description: 'ส่งตารางขึ้น Google Sheets (ผ่าน Apps Script)',
        icon: '☁️',
        defaultConfig: { url: '', mode: 'replace', auto: false, send_token: 0 },
      },
      {
        type: 'text_transform',
        label: 'แปลงข้อความ',
        description: 'แปลงข้อความตามกฎ เช่น person → คน',
        icon: '🔁',
        defaultConfig: { rules: [{ from: '', to: '' }], match: 'exact', fallback: 'keep', default: '' },
      },
    ],
  },
  {
    label: 'คณิตศาสตร์',
    icon: '🔢',
    blocks: [
      {
        type: 'number',
        label: 'ตัวเลข',
        description: 'จำนวนเต็ม / ทศนิยม',
        icon: '🔢',
        defaultConfig: { value: '0' },
      },
      {
        type: 'random_number',
        label: 'สุ่ม',
        description: 'คลิกหรือรับ True เพื่อสุ่ม',
        icon: '🎲',
        defaultConfig: { min: '1', max: '100', roll_token: 0 },
      },
      {
        type: 'math_op',
        label: 'คำนวณ',
        description: '+ − × ÷ %',
        icon: '➕',
        defaultConfig: { operator: '+' },
      },
      {
        type: 'math_function',
        label: 'ฟังก์ชันคณิต',
        description: '√ x² xⁿ |x| sin cos log ปัดเศษ ฯลฯ',
        icon: '🧮',
        defaultConfig: { func: 'sqrt', n: 2, deg: true },
      },
      {
        type: 'map_range',
        label: 'แปลงช่วงค่า (Map)',
        description: 'แปลงค่าจากช่วงหนึ่งไปอีกช่วง เช่น 0-1023 → 0-100',
        icon: '📏',
        defaultConfig: { in_min: 0, in_max: 100, out_min: 0, out_max: 1, clamp: true },
      },
      {
        type: 'clamp',
        label: 'จำกัดช่วง (Clamp)',
        description: 'บีบค่าให้อยู่ใน [ต่ำสุด, สูงสุด]',
        icon: '🗜️',
        defaultConfig: { min: 0, max: 100 },
      },
      {
        type: 'statistics',
        label: 'สถิติ',
        description: 'เฉลี่ย/ต่ำสุด/สูงสุด/ผลรวม/มัธยฐาน/นับ ของหลายค่า',
        icon: '📊',
        defaultConfig: { op: 'avg' },
      },
    ],
  },
  {
    label: 'เวลา',
    icon: '⏰',
    blocks: [
      {
        type: 'delay',
        label: 'หน่วงเวลา',
        description: 'รอ True ต่อเนื่อง N วินาที',
        icon: '⏱️',
        defaultConfig: { seconds: 2 },
      },
      {
        type: 'schedule',
        label: 'ตั้งเวลา',
        description: 'True เมื่อถึงวัน/เวลา',
        icon: '📅',
        defaultConfig: { datetime: '', mode: 'once', days: [] },
      },
      {
        type: 'interval',
        label: 'ทุกๆ N (Interval)',
        description: 'ยิง True เป็นรอบ ทุกๆ N วินาที/นาที',
        icon: '🔁',
        defaultConfig: { every: 5, unit: 'm' },
      },
    ],
  },
  {
    label: 'Loop',
    icon: '🔄',
    blocks: [
      {
        type: 'for_each',
        label: 'For Each (วนรายการ)',
        description: 'วนทีละตัวจาก list เช่น classes — เลื่อนด้วย next/Interval',
        icon: '🔂',
        defaultConfig: { field: 'auto', wrap: true, reset: 0 },
      },
      {
        type: 'repeat',
        label: 'Repeat (ทำซ้ำ N)',
        description: 'ยิง True ต่อเนื่อง N รอบแล้วหยุด (นับรอบที่ได้ trigger)',
        icon: '🔁',
        defaultConfig: { times: 3, reset: 0 },
      },
      {
        type: 'while',
        label: 'While (วนตามเงื่อนไข)',
        description: 'ส่ง True ทุก tick ขณะ input ยังเป็น True',
        icon: '♾️',
        defaultConfig: { reset: 0 },
      },
    ],
  },
  {
    label: 'ตรรกะ',
    icon: '🔀',
    blocks: [
      {
        type: 'if_else',
        label: 'If / Else',
        description: 'แยก pipeline ตามเงื่อนไข',
        icon: '🔀',
        defaultConfig: { condition: 'value', value: '' },
      },
      {
        type: 'compare',
        label: 'Compare',
        description: 'เปรียบเทียบ 2 ค่า',
        icon: '⚖️',
        defaultConfig: { operator: '=', value: '' },
      },
      {
        type: 'counter',
        label: 'Counter',
        description: 'นับครั้งที่รับ True',
        icon: '🔢',
        defaultConfig: { reset: 0 },
      },
      {
        type: 'toggle',
        label: 'Toggle',
        description: 'สลับ ON/OFF',
        icon: '🔁',
        defaultConfig: { reset: 0 },
      },
      {
        type: 'trigger_once',
        label: 'Trigger Once',
        description: 'ยิง True ครั้งเดียว',
        icon: '⚡',
        defaultConfig: { reset: 0 },
      },
      {
        type: 'hold',
        label: 'Hold',
        description: 'ค้าง True N วินาที',
        icon: '🪝',
        defaultConfig: { seconds: 3 },
      },
    ],
  },
  {
    label: 'Logic Gates',
    icon: '🔌',
    blocks: [
      { type: 'gate_and',  label: 'AND',  description: 'ทุกตัวเป็น True', icon: '∧', defaultConfig: {} },
      { type: 'gate_or',   label: 'OR',   description: 'มีตัวใดเป็น True', icon: '∨', defaultConfig: {} },
      { type: 'gate_not',  label: 'NOT',  description: 'กลับค่า', icon: '¬', defaultConfig: {} },
      { type: 'gate_nand', label: 'NAND', description: 'NOT AND', icon: '⊼', defaultConfig: {} },
      { type: 'gate_nor',  label: 'NOR',  description: 'NOT OR', icon: '⊽', defaultConfig: {} },
      { type: 'gate_xor',  label: 'XOR',  description: 'ต่างกัน = True', icon: '⊕', defaultConfig: {} },
      { type: 'gate_xnor', label: 'XNOR', description: 'เหมือนกัน = True', icon: '⊙', defaultConfig: {} },
    ],
  },
  {
    label: 'AI',
    icon: '🤖',
    blocks: [
      {
        type: 'detect',
        label: 'Detect (YOLO)',
        description: 'ตรวจจับวัตถุในภาพ',
        icon: '🎯',
        defaultConfig: { model: 'auto', confidence: 0.25, imgsz: 'fast' },
      },
      {
        type: 'classifier',
        label: 'Image Classifier',
        description: 'สอน AI ด้วยภาพตัวอย่าง',
        icon: '🏷️',
        defaultConfig: { label: '', examples: [], threshold: 0.75 },
      },
      {
        type: 'pose',
        label: 'Pose (ท่าทาง)',
        description: 'ท่าทาง: ยกมือ/T-pose/ชี้/ยืน-นั่ง',
        icon: '🤸',
        defaultConfig: { confidence: 0.25, trigger: 'hands' },
      },
      {
        type: 'object_count',
        label: 'นับวัตถุ',
        description: 'นับจาก Detect ตามชนิด',
        icon: '🔢',
        defaultConfig: { class_name: '' },
      },
      {
        type: 'color_detect',
        label: 'ตรวจจับสี',
        description: 'หาสีเด่นในภาพ',
        icon: '🎨',
        defaultConfig: {},
      },
      {
        type: 'ocr',
        label: 'OCR อ่านตัวอักษร',
        description: 'อ่านข้อความจากภาพ (ไทย+อังกฤษ)',
        icon: '🔤',
        defaultConfig: {},
      },
      {
        type: 'mnist',
        label: 'อ่านตัวเลข (MNIST)',
        description: 'จำแนกเลขเขียนมือ 0-9 (CNN)',
        icon: '✏️',
        defaultConfig: {},
      },
    ],
  },
  {
    label: 'AI · ใบหน้า',
    icon: '🎭',
    blocks: [
      {
        type: 'face_mesh',
        label: 'โครงใบหน้า',
        description: 'ตรวจหาใบหน้า + 478 จุด',
        icon: '🎭',
        defaultConfig: {},
      },
      {
        type: 'face_count',
        label: 'นับจำนวนใบหน้า',
        description: 'ใช้ผลจากโครงใบหน้า',
        icon: '🔢',
        defaultConfig: {},
      },
      {
        type: 'smile',
        label: 'รอยยิ้ม',
        description: 'ตรวจจับรอยยิ้ม — ต่อ Webcam ตรงๆ ได้',
        icon: '😊',
        defaultConfig: { threshold: 0.5 },
      },
      {
        type: 'face_recognition',
        label: 'จดจำใบหน้า',
        description: 'สอน AI ให้รู้จักคน',
        icon: '👤',
        defaultConfig: { name: '', examples: [], threshold: 0.36 },
      },
      {
        type: 'emotion',
        label: 'อารมณ์',
        description: 'ตรวจอารมณ์จากสีหน้า',
        icon: '😊',
        defaultConfig: {},
      },
    ],
  },
  {
    label: 'Deep Learning',
    icon: '🧠',
    blocks: [
      {
        type: 'deep_detect',
        label: 'DeepDetect',
        description: 'รันโมเดล detect ที่เทรนมาเอง (.pt/.onnx)',
        icon: '🎯',
        defaultConfig: { model_id: '', model_name: '', confidence: 0.25, imgsz: 'fast' },
      },
      {
        type: 'deep_classifier',
        label: 'DeepClassifier',
        description: 'รันโมเดลจำแนกภาพที่เทรนมาเอง (.pt/.onnx)',
        icon: '🏷️',
        defaultConfig: { model_id: '', model_name: '' },
      },
      {
        type: 'tracking',
        label: 'Tracking (ติดตาม+นับ)',
        description: 'ติดตามวัตถุข้ามเฟรม นับไม่ซ้ำ — วางได้หลายเส้น/หลายกรอบ',
        icon: '🛰️',
        defaultConfig: {
          regions: [], classes: '', confidence: 0.3, quality: 'auto', imgsz: 'fast', model_id: '', model_name: '', reset: 0, w: 320,
        },
      },
    ],
  },
  {
    label: 'แก้ไขภาพ',
    icon: '🎨',
    blocks: [
      { type: 'brightness', label: 'Brightness', description: 'ปรับความสว่าง', icon: '☀️', defaultConfig: { factor: 1.2 } },
      { type: 'contrast', label: 'Contrast', description: 'ปรับคอนทราสต์', icon: '◐', defaultConfig: { factor: 1.2 } },
      { type: 'saturation', label: 'Saturation', description: 'ปรับความอิ่มสี', icon: '🌈', defaultConfig: { factor: 1.2 } },
      { type: 'sharpen', label: 'Sharpen', description: 'เพิ่มความคม', icon: '🔪', defaultConfig: { factor: 2 } },
      { type: 'blur', label: 'Blur', description: 'เบลอภาพ', icon: '💧', defaultConfig: { radius: 2 } },
      { type: 'grayscale', label: 'Grayscale', description: 'แปลงขาวดำ', icon: '⬛', defaultConfig: {} },
      { type: 'invert', label: 'Invert', description: 'กลับสี', icon: '🔄', defaultConfig: {} },
      { type: 'rgb_adjust', label: 'RGB Adjust', description: 'ปรับช่อง R/G/B', icon: '🎨', defaultConfig: { r: 1, g: 1, b: 1 } },
      { type: 'style_transfer', label: 'Style Transfer', description: 'แปลงภาพเป็นสไตล์ศิลปะ', icon: '🎨', defaultConfig: { style: 'candy' } },
      { type: 'segmentation', label: 'แยกฉากหลัง', description: 'ตัดวัตถุออกจากพื้นหลัง', icon: '✂️', defaultConfig: { background: 'blur', confidence: 0.25 } },
    ],
  },
  {
    label: 'Output',
    icon: '📤',
    blocks: [
      {
        type: 'display',
        label: 'Display',
        description: 'แสดงผลลัพธ์บน canvas',
        icon: '🖥️',
        defaultConfig: {},
      },
      {
        type: 'chart',
        label: 'กราฟ',
        description: 'พล็อตข้อมูลจากตาราง — เส้น/แท่ง เปรียบเทียบได้',
        icon: '📈',
        defaultConfig: { title: '', type: 'line', labelMode: 'column', labelColumn: '', labelText: '', series: [{ column: '', color: '#a78bfa' }] },
      },
      {
        type: 'light_bulb',
        label: 'Light Bulb',
        description: 'ติด=True / ดับ=False',
        icon: '💡',
        defaultConfig: { color: '#facc15' },
      },
      {
        type: 'tts',
        label: 'Text to Speech',
        description: 'อ่านข้อความเมื่อ True',
        icon: '🔊',
        defaultConfig: { text: '', lang: 'th-TH', rate: 1, pitch: 1 },
      },
      {
        type: 'play_sound',
        label: 'เล่นเสียง',
        description: 'อัดเสียง/อัพโหลดไฟล์ แล้วเล่นเมื่อได้ True',
        icon: '🎵',
        defaultConfig: { audio: '', audioName: '', volume: 1 },
      },
    ],
  },
  {
    label: 'Arduino',
    icon: '🔌',
    blocks: [
      // Pin defaults are strings so they match the <select> options in the
      // config panel (e.target.value is always a string). Backend handlers
      // int()-cast on read so this round-trips cleanly.
      {
        type: 'arduino_digital_read',
        label: 'Digital Read',
        description: 'อ่านพิน digital (ปุ่ม / สวิตช์) → True/False',
        icon: '🔘',
        defaultConfig: { pin: '7', invert: 'false' },
      },
      {
        type: 'arduino_analog_read',
        label: 'Analog Read',
        description: 'อ่านพิน analog A0–A5 → ค่า 0–1023 (sensor)',
        icon: '📈',
        defaultConfig: { pin: '0', output_range: 'raw' },
      },
      {
        type: 'arduino_digital_write',
        label: 'Digital Write',
        description: 'เปิด/ปิดพิน digital (LED, relay)',
        icon: '💡',
        defaultConfig: { pin: '13', invert: 'false', default: false },
      },
      {
        type: 'arduino_analog_write',
        label: 'PWM Write',
        description: 'พิน ~ (3,5,6,9,10,11) — หรี่ LED / ความเร็วมอเตอร์',
        icon: '🎛️',
        defaultConfig: { pin: '9', scale: 'auto', default: 0 },
      },
      {
        type: 'arduino_servo',
        label: 'Servo',
        description: 'หมุนเซอร์โว 0–180°',
        icon: '🎯',
        defaultConfig: { pin: '9', min_angle: 0, max_angle: 180, default: 90 },
      },
    ],
  },
  {
    label: 'LINE',
    icon: '💬',
    blocks: [
      {
        type: 'line_push_text',
        label: 'Push Text',
        description: 'Push ข้อความเข้า LINE เมื่อ input = True (ใช้ {value} แทนค่า)',
        icon: '💬',
        defaultConfig: { text: 'ตรวจพบ: {value}', to: '' },
      },
      {
        type: 'line_push_image',
        label: 'Push Image',
        description: 'Push รูปเข้า LINE — ต้องเป็น HTTPS URL',
        icon: '🖼️',
        defaultConfig: { image_url: '', preview_url: '', to: '' },
      },
      {
        type: 'line_push_sticker',
        label: 'Push Sticker',
        description: 'Push สติกเกอร์ — เลือกจาก preview ได้',
        icon: '😀',
        defaultConfig: { package_id: 11537, sticker_id: 52002734, to: '' },
      },
      {
        type: 'line_push_flex',
        label: 'Push Flex',
        description: 'Push Flex Message — paste JSON จาก Flex Simulator',
        icon: '🧩',
        defaultConfig: {
          alt_text: 'Phoenix Flow notification',
          contents: '{\n  "type": "bubble",\n  "body": {\n    "type": "box",\n    "layout": "vertical",\n    "contents": [\n      { "type": "text", "text": "Hello from Phoenix Flow", "weight": "bold", "size": "md" }\n    ]\n  }\n}',
          to: '',
        },
      },
    ],
  },
]

export function NodePalette({ flowName, onRename }: NodePaletteProps = {}) {
  // All categories collapsed by default on every page load — user can expand any
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(BLOCK_CATEGORIES.map((c) => c.label))
  )
  const [search, setSearch] = useState('')
  // Only the TOGGLEABLE_CATEGORIES can be stashed via the Extensions drawer.
  // Everything else is a core tool that always renders. We still pass the
  // toggleable list down to the dialog so it only ever shows those 4 cards.
  const hiddenLabels = useExtensionsStore((s) => s.hidden)
  const toggleableLabels = useMemo(
    () => BLOCK_CATEGORIES.map((c) => c.label).filter((l) =>
      (TOGGLEABLE_CATEGORIES as readonly string[]).includes(l),
    ),
    [],
  )
  const visibleCategories = useMemo(
    () => BLOCK_CATEGORIES.filter((c) => {
      const isToggleable = (TOGGLEABLE_CATEGORIES as readonly string[]).includes(c.label)
      // Core tools are never filtered; toggleable categories obey the store.
      return !isToggleable || !hiddenLabels.includes(c.label)
    }),
    [hiddenLabels],
  )

  // Filter blocks by search query — match label, description, or type
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visibleCategories

    return visibleCategories
      .map((cat) => ({
        ...cat,
        blocks: cat.blocks.filter((b) =>
          b.label.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.type.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) =>
        cat.blocks.length > 0 || cat.label.toLowerCase().includes(q)
      )
  }, [search, visibleCategories])

  // When searching, force all categories to expanded so users see results
  const isSearching = search.trim().length > 0

  const toggleCategory = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const collapseAll = () => setCollapsed(new Set(BLOCK_CATEGORIES.map((c) => c.label)))
  const expandAll = () => setCollapsed(new Set())
  const allCollapsed = collapsed.size === BLOCK_CATEGORIES.length

  const onDragStart = (
    e: React.DragEvent,
    type: string,
    label: string,
    config: Record<string, unknown>
  ) => {
    e.dataTransfer.setData('application/reactflow-type', type)
    e.dataTransfer.setData('application/reactflow-label', label)
    e.dataTransfer.setData('application/reactflow-config', JSON.stringify(config))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-themed flex flex-col min-h-0">
      {/* Project card — logo, brand, language, editable flow name */}
      {flowName !== undefined && onRename && (
        <ProjectCard flowName={flowName} onRename={onRename} />
      )}

      {/* Search box + collapse-all toggle */}
      <div className="px-3 pt-1 pb-1 flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเครื่องมือ..."
            className="w-full pl-6 pr-6 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-700"
              title="ล้าง"
            >
              <X size={10} />
            </button>
          )}
        </div>
        {!isSearching && (
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="flex-shrink-0 text-[10px] text-zinc-500 hover:text-violet-400 px-1.5 py-1 hover:bg-zinc-800 rounded transition-colors whitespace-nowrap"
            title={allCollapsed ? 'แสดงทุกหมวด' : 'ซ่อนทุกหมวด'}
          >
            {allCollapsed ? 'แสดง' : 'ซ่อน'}
          </button>
        )}
      </div>

      <div className="p-3 space-y-2 flex-1">
        {filteredCategories.length === 0 && (
          <div className="text-center text-xs text-zinc-600 py-8 px-2">
            {isSearching
              ? `ไม่พบ "${search}"`
              : 'ยังไม่มี block — เริ่มสร้างกันเลย!'}
          </div>
        )}
        {filteredCategories.map((cat) => {
          // Force expand while searching so results are visible
          const isCollapsed = isSearching ? false : collapsed.has(cat.label)
          return (
          <div key={cat.label}>
            <button
              onClick={() => toggleCategory(cat.label)}
              className="w-full flex items-center gap-1.5 mb-1.5 py-1 px-1 -mx-1 rounded hover:bg-zinc-800/60 transition-colors group"
              title={isCollapsed ? 'แสดงหมวด' : 'ซ่อนหมวด'}
            >
              {isCollapsed ? (
                <ChevronRight size={12} className="text-zinc-500 group-hover:text-zinc-300" />
              ) : (
                <ChevronDown size={12} className="text-zinc-500 group-hover:text-zinc-300" />
              )}
              <CategoryIcon name={cat.label} size={13} className="text-violet-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider group-hover:text-zinc-200">
                {cat.label}
              </span>
              <span className="ml-auto text-[10px] text-zinc-600">
                {cat.blocks.length}
              </span>
            </button>
            {!isCollapsed && (
            <div className="space-y-1.5 mb-2">
              {cat.blocks.map((block) => (
                <div
                  key={block.type}
                  draggable
                  onDragStart={(e) =>
                    onDragStart(e, block.type, block.label, block.defaultConfig)
                  }
                  className="flex items-center gap-2 p-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-violet-500 rounded-lg cursor-grab active:cursor-grabbing transition-all group"
                >
                  {block.type.startsWith('gate_') ? (
                    <GateSymbol type={block.type} className="w-7 h-5 flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-5 flex items-center justify-center flex-shrink-0">
                      <BlockIcon type={block.type} size={15} className="text-violet-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-200 group-hover:text-white">
                      {block.label}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">{block.description}</div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
          )
        })}
      </div>

      {/* Extensions drawer — pinned at the bottom of the palette. Lets the
          user stash / un-stash entire categories so the palette stays tidy.
          Only the TOGGLEABLE_CATEGORIES set is exposed here. */}
      <div className="border-t border-zinc-800 p-3 bg-zinc-900/40">
        <ExtensionsButton allCategoryLabels={toggleableLabels} />
      </div>
    </div>
  )
}
