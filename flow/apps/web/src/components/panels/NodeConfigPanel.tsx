'use client'

import { X } from 'lucide-react'
import { useFlowStore } from '@/stores/flowStore'
import { TextInput, TextArea } from '@/components/ui/StableField'
import { LineStickerPicker } from './LineStickerPicker'

// Config fields per block type. Add an entry as we build each block:
//   my_type: [{ key: 'url', label: 'URL', type: 'text' }, ...]
// Supported field types: 'text' | 'number' | 'textarea' | 'select' (with options)
interface ConfigField {
  key: string
  label: string
  type: string
  options?: string[]
  optionLabels?: Record<string, string>  // value → display label (for select)
  min?: number
  max?: number
  step?: number
}

// Arduino UNO pin tables — shared by the five Arduino blocks below.
//
// D0/D1 are intentionally excluded: they're the USB serial pair and using them
// kills the Firmata connection. PWM-capable pins (~) are 3, 5, 6, 9, 10, 11.
// Analog inputs A0..A5 are stored as "0".."5" so the backend `int(pin)` cast
// works without remapping.
const ARDUINO_DIGITAL_PINS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']
const _PWM_SET = new Set(['3', '5', '6', '9', '10', '11'])
const ARDUINO_DIGITAL_LABELS: Record<string, string> = Object.fromEntries(
  ARDUINO_DIGITAL_PINS.map((p) => [
    p,
    _PWM_SET.has(p)
      ? `D${p}  ~PWM`
      : p === '13'
      ? `D${p}  (on-board LED)`
      : `D${p}`,
  ]),
)
const ARDUINO_PWM_PINS = ['3', '5', '6', '9', '10', '11']
const ARDUINO_PWM_LABELS: Record<string, string> = Object.fromEntries(
  ARDUINO_PWM_PINS.map((p) => [p, `D${p}  ~PWM`]),
)
const ARDUINO_ANALOG_PINS = ['0', '1', '2', '3', '4', '5']
const ARDUINO_ANALOG_LABELS: Record<string, string> = Object.fromEntries(
  ARDUINO_ANALOG_PINS.map((p) => [p, `A${p}`]),
)

const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  random_number: [
    { key: 'min', label: 'ค่าต่ำสุด (min)', type: 'number' },
    { key: 'max', label: 'ค่าสูงสุด (max)', type: 'number' },
  ],
  speech_to_text: [
    {
      key: 'lang', label: 'ภาษา', type: 'select',
      options: ['th-TH', 'en-US', 'ja-JP', 'zh-CN', 'ko-KR'],
    },
  ],
  // If/Else: branches are edited inline on the node itself
  detect: [
    {
      key: 'model', label: 'YOLO Model', type: 'select',
      // 'auto' picks the best size for the hardware (m on GPU — free there —
      // n on CPU). v8 entries kept so pre-upgrade flows stay loadable.
      options: ['auto', 'yolo26n.pt', 'yolo26s.pt', 'yolo26m.pt', 'yolov8n.pt', 'yolov8s.pt'],
      optionLabels: {
        'auto': 'อัตโนมัติ (แนะนำ — แม่นสุดเท่าที่เครื่องไหว)',
        'yolo26n.pt': 'YOLO26 n (เร็วสุด)',
        'yolo26s.pt': 'YOLO26 s (กลาง)',
        'yolo26m.pt': 'YOLO26 m (แม่นสุด)',
        'yolov8n.pt': 'YOLOv8 n (รุ่นเก่า)',
        'yolov8s.pt': 'YOLOv8 s (รุ่นเก่า)',
      },
    },
    {
      key: 'imgsz', label: 'ความละเอียด', type: 'select',
      options: ['fast', 'medium', 'original'],
      optionLabels: {
        'fast': '640 (เร็ว)',
        'medium': '960 (ปานกลาง — จับวัตถุเล็กดีขึ้น)',
        'original': 'ต้นฉบับ (ช้า — ละเอียดสุด)',
      },
    },
    { key: 'confidence', label: 'Confidence', type: 'range', min: 0, max: 1, step: 0.01 },
  ],
  pose: [
    { key: 'confidence', label: 'Confidence', type: 'range', min: 0, max: 1, step: 0.01 },
    {
      key: 'trigger', label: 'กระตุ้น (result = True) เมื่อ', type: 'select',
      options: ['hands', 'left', 'right', 'tpose', 'stand', 'sit'],
      optionLabels: {
        hands: '🙌 ยกมือ (ข้างใดก็ได้)',
        left: '✋ ยกมือซ้าย',
        right: '🤚 ยกมือขวา',
        tpose: '🤸 กางแขน (T-pose)',
        stand: '🧍 ยืน',
        sit: '🪑 นั่ง',
      },
    },
  ],
  object_count: [
    { key: 'class_name', label: 'ชนิดวัตถุ (ว่าง = ทั้งหมด)', type: 'text' },
  ],
  tracking: [
    {
      key: 'quality', label: 'โมเดล', type: 'select',
      options: ['auto', 'fast', 'balanced', 'accurate'],
      optionLabels: { auto: 'อัตโนมัติ (แนะนำ)', fast: 'เร็ว (n)', balanced: 'กลาง (s)', accurate: 'แม่นสุด (m)' },
    },
    {
      key: 'imgsz', label: 'ความละเอียด', type: 'select',
      options: ['fast', 'medium', 'original'],
      optionLabels: { fast: '640 (เร็ว)', medium: '960 (ปานกลาง)', original: 'ต้นฉบับ (ช้า)' },
    },
    { key: 'confidence', label: 'Confidence', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'classes', label: 'กรองชนิด (ว่าง = ทุกชนิด)', type: 'text' },
    {
      key: 'trajectory', label: 'วาดเส้นทางการเคลื่อนที่', type: 'select',
      options: ['off', 'on'], optionLabels: { off: 'ปิด', on: 'เปิด' },
    },
    { key: 'dwell_alert', label: 'เตือนเมื่อค้างในพื้นที่เกิน (วินาที, 0=ปิด)', type: 'number' },
  ],
  deep_detect: [
    {
      key: 'imgsz', label: 'ความละเอียด', type: 'select',
      options: ['fast', 'medium', 'original'],
      optionLabels: {
        'fast': '640 (เร็ว)',
        'medium': '960 (ปานกลาง — จับวัตถุเล็กดีขึ้น)',
        'original': 'ต้นฉบับ (ช้า — ละเอียดสุด)',
      },
    },
    { key: 'confidence', label: 'Confidence', type: 'range', min: 0, max: 1, step: 0.01 },
  ],
  style_transfer: [
    {
      key: 'style', label: 'สไตล์ศิลปะ', type: 'select',
      options: ['candy', 'mosaic', 'rain', 'udnie', 'pointilism'],
      optionLabels: {
        candy: '🍬 Candy',
        mosaic: '🟫 Mosaic',
        rain: '🌧️ Rain Princess',
        udnie: '🎭 Udnie',
        pointilism: '🔵 Pointilism',
      },
    },
  ],
  segmentation: [
    {
      key: 'background', label: 'พื้นหลัง', type: 'select',
      options: ['blur', 'white', 'black'],
      optionLabels: { blur: '🌫️ เบลอ', white: '⬜ ขาว', black: '⬛ ดำ' },
    },
    { key: 'confidence', label: 'Confidence', type: 'range', min: 0, max: 1, step: 0.01 },
  ],
  classifier: [
    { key: 'threshold', label: 'เกณฑ์ความคล้าย', type: 'range', min: 0.4, max: 0.95, step: 0.01 },
  ],
  face_recognition: [
    // SFace cosine scale: same person ≈ 0.4–0.7, stranger ≈ ≤ 0.2 (default 0.36)
    { key: 'threshold', label: 'เกณฑ์ความคล้าย', type: 'range', min: 0.2, max: 0.6, step: 0.01 },
  ],
  light_bulb: [
    { key: 'color', label: 'สีหลอดไฟตอนติด', type: 'color' },
  ],
  tts: [
    {
      key: 'lang', label: 'ภาษา', type: 'select',
      options: ['th-TH', 'en-US', 'ja-JP', 'zh-CN', 'ko-KR'],
    },
    { key: 'rate',  label: 'ความเร็ว', type: 'range', min: 0.5, max: 2,   step: 0.1 },
    { key: 'pitch', label: 'ระดับเสียง', type: 'range', min: 0,   max: 2,   step: 0.1 },
  ],
  smile: [
    // HSEmotion 'happy' probability (0–1); higher = must look more clearly happy
    { key: 'threshold', label: 'เกณฑ์ความมั่นใจ', type: 'range', min: 0, max: 1, step: 0.05 },
  ],
  // Image-editing blocks have their sliders inline on the node itself.

  // ── Arduino UNO (Phoenix Extensions) ──────────────────────────────────────
  // Pin pickers are dropdowns so the user can only pick pins that work for the
  // block's function. We deliberately exclude D0/D1 (USB serial — using them
  // breaks the Firmata connection) and limit analog reads to A0–A5.
  //
  // Pin values are stored as STRINGS in config (because <select> e.target.value
  // is a string); the backend handlers do int(config["pin"]) on read so this
  // round-trips cleanly.
  arduino_digital_read: [
    { key: 'pin', label: 'พิน', type: 'select',
      options: ARDUINO_DIGITAL_PINS, optionLabels: ARDUINO_DIGITAL_LABELS },
    { key: 'invert', label: 'กลับค่า (Active-LOW)', type: 'select',
      options: ['false', 'true'], optionLabels: { false: 'ไม่กลับ', true: 'กลับค่า' } },
  ],
  arduino_analog_read: [
    { key: 'pin', label: 'พิน analog', type: 'select',
      options: ARDUINO_ANALOG_PINS, optionLabels: ARDUINO_ANALOG_LABELS },
    { key: 'output_range', label: 'หน่วยที่ส่งออก', type: 'select',
      options: ['raw', '0-1', 'voltage', 'percent'],
      optionLabels: { raw: '0–1023 (ดิบ)', '0-1': '0.0–1.0', voltage: '0–5 V', percent: '0–100%' } },
  ],
  arduino_digital_write: [
    { key: 'pin', label: 'พิน', type: 'select',
      options: ARDUINO_DIGITAL_PINS, optionLabels: ARDUINO_DIGITAL_LABELS },
    { key: 'invert', label: 'กลับค่า', type: 'select',
      options: ['false', 'true'], optionLabels: { false: 'ไม่กลับ', true: 'กลับค่า' } },
  ],
  arduino_analog_write: [
    { key: 'pin', label: 'พิน PWM', type: 'select',
      options: ARDUINO_PWM_PINS, optionLabels: ARDUINO_PWM_LABELS },
    { key: 'scale', label: 'ช่วงค่าที่รับ', type: 'select',
      options: ['auto', '0-1', '0-255'],
      optionLabels: { auto: 'อัตโนมัติ', '0-1': '0.0–1.0', '0-255': '0–255' } },
  ],
  arduino_servo: [
    { key: 'pin', label: 'พิน', type: 'select',
      options: ARDUINO_DIGITAL_PINS, optionLabels: ARDUINO_DIGITAL_LABELS },
    { key: 'min_angle', label: 'มุมต่ำสุด', type: 'range', min: 0, max: 180, step: 1 },
    { key: 'max_angle', label: 'มุมสูงสุด', type: 'range', min: 0, max: 180, step: 1 },
    { key: 'default', label: 'มุมเริ่มต้น', type: 'range', min: 0, max: 180, step: 1 },
  ],

  // ── LINE Messaging ────────────────────────────────────────────────────────
  // All push blocks accept a `to` override (blank = Connector default). Text
  // / image-url / alt-text fields support {value} substitution from input.
  line_push_text: [
    { key: 'text', label: 'ข้อความ — ใช้ {value} แทนค่าจาก input', type: 'textarea' },
    { key: 'to', label: 'User/Group/Room ID (ว่าง = ใช้ default)', type: 'text' },
  ],
  line_push_image: [
    { key: 'image_url', label: 'Image URL (HTTPS) — ใช้ {value} ได้', type: 'text' },
    { key: 'preview_url', label: 'Preview URL (ว่าง = ใช้ตัวเดียวกับ Image)', type: 'text' },
    { key: 'to', label: 'User/Group/Room ID (ว่าง = ใช้ default)', type: 'text' },
  ],
  line_push_sticker: [
    { key: 'package_id', label: 'Package ID', type: 'number' },
    { key: 'sticker_id', label: 'Sticker ID', type: 'number' },
    { key: 'to', label: 'User/Group/Room ID (ว่าง = ใช้ default)', type: 'text' },
  ],
  line_push_flex: [
    { key: 'alt_text', label: 'Alt Text (โน้ตที่ขึ้นใน push) — ใช้ {value} ได้', type: 'text' },
    { key: 'contents', label: 'Flex JSON — paste จาก LINE Flex Simulator', type: 'textarea' },
    { key: 'to', label: 'User/Group/Room ID (ว่าง = ใช้ default)', type: 'text' },
  ],
}

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, updateNodeConfig, selectNode } = useFlowStore()
  const node = nodes.find((n) => n.id === selectedNodeId)

  if (!node) return null

  const fields = CONFIG_FIELDS[node.type] || []

  // Blocks with no panel fields (e.g. image-edit blocks have inline sliders,
  // upload/webcam configure themselves) don't show the side panel at all.
  if (fields.length === 0) return null

  return (
    <aside className="w-72 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Configure Node</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{node.data.label}</p>
        </div>
        <button
          onClick={() => selectNode(null)}
          className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto scrollbar-themed">
        {fields.length === 0 && (
          <p className="text-xs text-zinc-500 italic">No configuration needed.</p>
        )}

        {/* Block-specific custom UI lives above the generic field list. The
            LINE sticker picker shows a live preview + a preset grid so the
            user doesn't have to know sticker IDs by heart. */}
        {node.type === 'line_push_sticker' && (
          <LineStickerPicker
            nodeId={node.id}
            pkg={Number(node.data.config.package_id ?? 446)}
            sid={Number(node.data.config.sticker_id ?? 1988)}
          />
        )}

        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">{field.label}</label>
              {field.type === 'range' && (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(node.data.config[field.key] ?? field.min ?? 0)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v)) return
                    const lo = field.min ?? -Infinity
                    const hi = field.max ?? Infinity
                    updateNodeConfig(node.id, { [field.key]: Math.min(hi, Math.max(lo, v)) })
                  }}
                  className="w-20 px-1.5 py-0.5 text-xs font-mono text-right text-violet-300 tabular-nums bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-violet-500"
                />
              )}
            </div>

            {field.type === 'range' ? (
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={Number(node.data.config[field.key] ?? field.min ?? 0)}
                onChange={(e) => updateNodeConfig(node.id, { [field.key]: parseFloat(e.target.value) })}
                className="w-full accent-violet-500 cursor-pointer"
              />
            ) : field.type === 'select' ? (
              <select
                value={(node.data.config[field.key] as string) || ''}
                onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{field.optionLabels?.[opt] ?? opt}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <TextArea
                rows={4}
                value={(node.data.config[field.key] as string) || ''}
                onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none font-mono"
              />
            ) : field.type === 'color' ? (
              <div className="flex items-center gap-2">
                <label
                  className="relative block w-12 h-9 rounded-md border border-zinc-700 hover:border-violet-500 cursor-pointer overflow-hidden transition-colors"
                  style={{ backgroundColor: (node.data.config[field.key] as string) || '#facc15' }}
                >
                  <input
                    type="color"
                    value={(node.data.config[field.key] as string) || '#facc15'}
                    onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
                <TextInput
                  type="text"
                  value={(node.data.config[field.key] as string) || ''}
                  onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                  placeholder="#facc15"
                  className="flex-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={(node.data.config[field.key] as string) || ''}
                onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
              />
            ) : (
              <TextInput
                type={field.type}
                value={(node.data.config[field.key] as string) || ''}
                onChange={(e) => updateNodeConfig(node.id, { [field.key]: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
              />
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
