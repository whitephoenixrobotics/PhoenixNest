'use client'

import {
  // Input
  ImageIcon, Camera, Type, ToggleLeft, CircleDot, Keyboard,
  Mic, Palette, Globe, Brush,
  // AI
  ScanSearch, Tags, Scan, Users, Smile, UserCheck,
  PersonStanding, Hash as HashCount, Pipette, ScanText, Laugh,
  // Deep Learning
  PencilLine, Palette as PaletteStyle, Scissors, BrainCircuit, Crosshair, Radar,
  // Image edit
  Sun, Contrast, Droplet, Sparkles, SunDim, RotateCcw, CircleDashed, SlidersHorizontal,
  // Logic
  GitFork, Scale, Hash, RefreshCw, Zap, AlarmClock,
  // Time
  Timer, CalendarClock, Repeat,
  // Loop
  ListOrdered, IterationCcw, IterationCw,
  // Math
  Dices, Calculator, FunctionSquare, Gauge, Minimize2, BarChart3,
  // Data
  FileJson, Table, TableProperties, Sigma, Filter as FilterIcon, Combine, CloudUpload, Replace, LineChart,
  // Output
  Monitor, Lightbulb, Volume2, Music,
  // Categories
  Download, Brain, Image, Workflow, Calendar as CalendarCat, Calculator as CalcCat,
  FileJson as DataCat, Upload, Cpu, MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { useThemeStore, KIDS_THEMES } from '@/stores/themeStore'

export const BLOCK_ICONS: Record<string, LucideIcon> = {
  // Input
  image_upload:   ImageIcon,
  webcam_capture: Camera,
  text_input:     Type,
  switch:         ToggleLeft,
  button:         CircleDot,
  hotkey:         Keyboard,
  speech_to_text: Mic,
  color_picker:   Palette,
  http_fetch:     Globe,
  draw_pad:       Brush,

  // AI
  detect:           ScanSearch,
  classifier:       Tags,
  pose:             PersonStanding,
  object_count:     HashCount,
  color_detect:     Pipette,
  ocr:              ScanText,
  face_mesh:        Scan,
  face_count:       Users,
  smile:            Smile,
  face_recognition: UserCheck,
  emotion:          Laugh,

  // Deep Learning
  mnist:           PencilLine,
  style_transfer:  PaletteStyle,
  segmentation:    Scissors,
  deep_detect:     Crosshair,
  deep_classifier: Tags,
  tracking:        Radar,

  // Image edit
  brightness: Sun,
  contrast:   Contrast,
  saturation: Droplet,
  sharpen:    Sparkles,
  grayscale:  SunDim,
  invert:     RotateCcw,
  blur:       CircleDashed,
  rgb_adjust: SlidersHorizontal,

  // Logic
  if_else:      GitFork,
  compare:      Scale,
  counter:      Hash,
  toggle:       RefreshCw,
  trigger_once: Zap,
  hold:         AlarmClock,

  // Time
  delay:    Timer,
  schedule: CalendarClock,
  interval: Repeat,

  // Loop
  for_each: ListOrdered,
  repeat:   IterationCw,
  while:    IterationCcw,

  // Math
  number:        Hash,
  random_number: Dices,
  math_op:       Calculator,
  math_function: FunctionSquare,
  map_range:     Gauge,
  clamp:         Minimize2,
  statistics:    BarChart3,

  // Data
  json_extract: FileJson,
  data_table:   Table,
  table_read:   TableProperties,
  aggregate:    Sigma,
  filter:       FilterIcon,
  join_text:    Combine,
  sheets_write: CloudUpload,
  text_transform: Replace,

  // Output
  display:    Monitor,
  chart:      LineChart,
  light_bulb: Lightbulb,
  tts:        Volume2,
  play_sound: Music,
}

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Input:        Download,
  AI:           Brain,
  'AI · ใบหน้า': Scan,
  'Deep Learning': BrainCircuit,
  'แก้ไขภาพ':    Image,
  'Logic Gates': Workflow,
  ตรรกะ:        GitFork,
  เวลา:         CalendarCat,
  Loop:         IterationCw,
  คณิตศาสตร์:   CalcCat,
  ข้อมูล:        DataCat,
  Output:       Upload,
  Arduino:      Cpu,
  LINE:         MessageCircle,
}

// Cute emoji icons — shown instead of line icons when the Kids theme is on
export const BLOCK_EMOJI: Record<string, string> = {
  image_upload: '🖼️', webcam_capture: '📷', text_input: '📝', switch: '🎚️',
  button: '🔘', hotkey: '⌨️', speech_to_text: '🎙️', color_picker: '🎨', http_fetch: '🔗', draw_pad: '🖌️',
  detect: '🎯', classifier: '🏷️', pose: '🤸', object_count: '🔢', color_detect: '🎨', ocr: '🔤',
  face_mesh: '🎭', face_count: '🧑‍🤝‍🧑', smile: '😊', face_recognition: '🧑', emotion: '😄',
  mnist: '✏️', style_transfer: '🎨', segmentation: '✂️', deep_detect: '🎯', deep_classifier: '🏷️', tracking: '🛰️',
  brightness: '☀️', contrast: '🌗', saturation: '🌈', sharpen: '✨', grayscale: '⬛',
  invert: '🔄', blur: '💧', rgb_adjust: '🎨',
  if_else: '🔀', compare: '⚖️', counter: '🔢', toggle: '🔁', trigger_once: '⚡', hold: '🪝',
  delay: '⏱️', schedule: '📅', interval: '🔁',
  for_each: '🔂', repeat: '🔁', while: '♾️',
  number: '🔢', random_number: '🎲', math_op: '➕',
  math_function: '🧮', map_range: '📏', clamp: '🗜️', statistics: '📊',
  json_extract: '🔍', data_table: '📊', table_read: '📑',
  aggregate: '∑', filter: '🔎', join_text: '🧩', sheets_write: '☁️', text_transform: '🔁',
  display: '🖥️', light_bulb: '💡', tts: '🔊', chart: '📈', play_sound: '🎵',
  arduino_digital_read: '🔘', arduino_analog_read: '📈',
  arduino_digital_write: '💡', arduino_analog_write: '🎛️', arduino_servo: '🎯',
  line_push_text: '💬', line_push_image: '🖼️', line_push_sticker: '😀', line_push_flex: '🧩',
}

export const CATEGORY_EMOJI: Record<string, string> = {
  Input: '📥', AI: '🧠', 'AI · ใบหน้า': '😀', 'Deep Learning': '🧠', 'แก้ไขภาพ': '🎨',
  'Logic Gates': '🔌', ตรรกะ: '🔀', เวลา: '⏰', Loop: '🔄', คณิตศาสตร์: '🔢',
  ข้อมูล: '📦', Output: '📤', Arduino: '🔌', LINE: '💬',
}

function useKidsMode() {
  return useThemeStore((s) => KIDS_THEMES.has(s.themeId))
}

interface BlockIconProps {
  type: string
  size?: number
  className?: string
}

export function BlockIcon({ type, size = 16, className = 'text-violet-400' }: BlockIconProps) {
  const kids = useKidsMode()
  if (kids && BLOCK_EMOJI[type]) {
    return <span style={{ fontSize: size + 2, lineHeight: 1 }}>{BLOCK_EMOJI[type]}</span>
  }
  const Icon = BLOCK_ICONS[type]
  if (!Icon) return null
  return <Icon size={size} className={className} strokeWidth={2} />
}

export function CategoryIcon({ name, size = 14, className = 'text-violet-400' }: { name: string; size?: number; className?: string }) {
  const kids = useKidsMode()
  if (kids && CATEGORY_EMOJI[name]) {
    return <span style={{ fontSize: size + 2, lineHeight: 1 }}>{CATEGORY_EMOJI[name]}</span>
  }
  const Icon = CATEGORY_ICONS[name]
  if (!Icon) return null
  return <Icon size={size} className={className} strokeWidth={2} />
}
