<div align="center">

# 🔥 PhoenixFlow

**AI Block-based Platform — สร้าง AI workflow แบบลากวาง ไม่ต้องเขียนโค้ด**

ลากบล็อกมาต่อกันบน canvas → เชื่อมเป็น pipeline → รันได้ทันที
เทรนโมเดล AI ของตัวเองได้ในเครื่อง (ใช้ CPU/GPU ของคุณเอง)

</div>

---

## PhoenixFlow คืออะไร

PhoenixFlow คือแพลตฟอร์มสร้าง AI แบบ **block-based** (คล้าย Scratch / Node-RED แต่เน้น AI/Computer Vision) —
ผู้ใช้ลากบล็อกมาต่อกันบน canvas เพื่อสร้าง workflow เช่น *กล้อง → ตรวจจับวัตถุ → แสดงผล* โดยไม่ต้องเขียนโปรแกรม

จุดเด่น:
- 🎨 **Visual editor** — ลากวางบล็อก เชื่อมเส้น เห็นผลแบบ real-time (React Flow)
- 🧠 **เทรน AI เองได้** — TrainAI สอนโมเดลจำแนกภาพ/ตรวจจับวัตถุจากรูปของคุณเอง
- 💻 **ใช้เครื่องตัวเอง** — การประมวลผล/เทรนรันบน CPU/GPU ในเครื่อง (offline, ไม่ส่งข้อมูลขึ้น cloud)
- 🔐 **ควบคุมผู้ใช้** — ล็อกอิน Google + ระบบอนุมัติโดยแอดมิน
- 🔌 **ต่อโลกจริง** — เชื่อมบอร์ด Arduino, แจ้งเตือนเข้า LINE, เขียน Google Sheets
- 🖥️ **Desktop App** — Electron พร้อม auto-update

---

## สถาปัตยกรรม (Tech Stack)

| ส่วน | เทคโนโลยี |
|------|-----------|
| Frontend | Next.js 16 + React 19 + React Flow (`@xyflow/react`) + Tailwind |
| Backend | FastAPI + SQLAlchemy (async) + Alembic |
| Database | SQLite (อยู่ในเครื่อง — ไม่ต้องตั้ง DB แยกหรือ Docker) |
| Desktop | Electron + electron-updater |
| Auth | Google OAuth (ผ่าน backend) + JWT + ระบบอนุมัติ |
| AI / ML | PyTorch (CUDA), Ultralytics YOLOv8, OpenCV, EasyOCR, OpenCLIP, MediaPipe, faster-whisper |
| ฮาร์ดแวร์ / เชื่อมต่อ | Arduino (pyfirmata2 + StandardFirmata), LINE Messaging API, Google Sheets |

โครงสร้าง monorepo (pnpm + turbo): `apps/web` (UI) · `apps/api` (backend + AI engine) · `apps/desktop` (Electron)

---

## ✨ ฟีเจอร์หลัก (เวอร์ชันนี้ · v0.4.2)

- **Flow Editor** — สร้าง/บันทึก/รัน workflow บน canvas, รันสด (live) ผ่าน WebSocket
- **TrainAI** — เทรนโมเดลเอง 2 แบบ:
  - 🏷️ **จำแนกภาพ** (Classification) — ถ่าย/อัปโหลดรูปแยกคลาส แล้วเทรน
  - 🎯 **ตรวจจับวัตถุ** (Detection) — ตีกรอบ (วาดเอง/ให้ AI ช่วย) แล้วเทรน YOLO
  - มี Data Augmentation, เลือก base model, ทดสอบโมเดล, ดาวน์โหลด `.pt`
- **Auth & ผู้ใช้** — ล็อกอิน Google, ผู้ใช้ใหม่ต้องรอแอดมิน **อนุมัติ**, หน้าจัดการผู้ใช้สำหรับแอดมิน
- **Desktop App** — Electron (ต้องออนไลน์ + ล็อกอิน), auto-update ผ่าน GitHub Releases
- **Speech to Text** — ถอดเสียงเป็นข้อความแบบ offline ด้วย faster-whisper (ภาษาไทย, ใช้ GPU, มีโหมดถอดสด/อัดแล้วถอด + เลือกขนาดโมเดล)
- **เชื่อมฮาร์ดแวร์ & แจ้งเตือน** — ต่อ **Arduino** (digital/analog/PWM/servo ผ่าน USB, มีปุ่ม Flash firmware ในตัว), Push เข้า **LINE** (text/image/sticker/flex), เขียน **Google Sheets**
- **ข้อมูล & ตรรกะ** — ตารางข้อมูล + กราฟ, Loop (For Each / Repeat / While), และ **If/Else แบบสร้างเงื่อนไข** — เลือก input ทีละตัว (value1/text1…), เชื่อม AND/OR + ตัวเทียบ `= ≠ > < ≥ ≤`, เลือก single/multi-output

---

## 🧰 เครื่องมือ (บล็อก) ที่ใช้ได้ใน v0.4.2

รวม **~83 บล็อก** ใน 14 หมวด (ซ่อน/แสดงบางหมวดได้ผ่านปุ่ม Extensions):

### 📥 Input — รับข้อมูลเข้า
Upload ภาพ/วิดีโอ · Webcam · Text · Switch · Button · Hotkey · Speech to Text · Color · HTTP Fetch · วาดรูป

### 🔍 ข้อมูล
| บล็อก | หน้าที่ |
|-------|---------|
| JSON Extract | ดึงค่าจาก JSON หลาย path (value1/value2…) + template |
| ตารางข้อมูล | เก็บข้อมูลเป็นตาราง ตั้งหัวคอลัมน์ ดึงจากบล็อกอื่น |
| อ่านจากตาราง | อ่านค่าจากตาราง (เลือกคอลัมน์/แถว/ชนิด) |
| สรุปตาราง | min / max / avg / sum / count / last ของคอลัมน์ |
| กรองตาราง | กรองแถวตามเงื่อนไข (เช่น PM > 50) |
| รวมข้อความ | รวมหลาย input เป็นข้อความเดียวด้วย template |
| เขียนลง Sheets | ส่งตารางขึ้น Google Sheets (ผ่าน Apps Script) |
| แปลงข้อความ | แมปข้อความตามกฎ (เช่น person → คน) |

### 🔢 คณิตศาสตร์
ตัวเลข · สุ่ม · คำนวณ (+ − × ÷ %) · ฟังก์ชันคณิต (√ x² xⁿ sin cos log…) · แปลงช่วงค่า (Map) · จำกัดช่วง (Clamp) · สถิติ

### ⏰ เวลา
หน่วงเวลา · ตั้งเวลา (วัน/เวลา) · ทุกๆ N (Interval)

### 🔄 Loop
For Each (วนรายการ) · Repeat (ทำซ้ำ N) · While (วนตามเงื่อนไข)

### 🔀 ตรรกะ (Logic)
| บล็อก | หน้าที่ |
|-------|---------|
| If / Else | สร้างเงื่อนไขหลายชั้น — เลือก input (value1/text1…), เชื่อม AND/OR + ตัวเทียบ `= ≠ > < ≥ ≤`, single/multi-output |
| Compare | เปรียบเทียบ 2 ค่า |
| Counter · Toggle · Trigger Once · Hold | นับครั้ง / สลับ ON-OFF / ยิงครั้งเดียว / ค้าง True N วินาที |

### 🔌 Logic Gates
AND · OR · NOT · NAND · NOR · XOR · XNOR

### 🤖 AI
Detect (YOLO) · Image Classifier · Pose (ท่าทาง) · นับวัตถุ · ตรวจจับสี · OCR (ไทย+อังกฤษ) · อ่านตัวเลข (MNIST)

### 🎭 AI · ใบหน้า
โครงใบหน้า (478 จุด) · นับจำนวนใบหน้า · รอยยิ้ม · จดจำใบหน้า · อารมณ์

### 🧠 Deep Learning
DeepDetect / DeepClassifier (รันโมเดล `.pt`/`.onnx` ที่เทรนเอง) · Tracking (ติดตามวัตถุข้ามเฟรม นับไม่ซ้ำ)

### 🎨 แก้ไขภาพ
Brightness · Contrast · Saturation · Sharpen · Blur · Grayscale · Invert · RGB Adjust · Style Transfer · แยกฉากหลัง (Segmentation)

### 📤 Output — แสดงผล
Display · กราฟ (เส้น/แท่ง) · Light Bulb · Text to Speech · เล่นเสียง

### 🔌 Arduino — เชื่อมบอร์ดจริง
| บล็อก | หน้าที่ |
|-------|---------|
| Digital Read / Write | อ่าน/เขียนพินดิจิทัล (ปุ่ม·สวิตช์ / LED·relay) |
| Analog Read | อ่านพิน A0–A5 (0–1023) จากเซนเซอร์ |
| PWM Write | หรี่ LED / ปรับความเร็วมอเตอร์ (พิน ~) |
| Servo | หมุนเซอร์โว 0–180° |

> เชื่อมผ่าน USB ด้วย StandardFirmata — มีปุ่ม **Flash firmware** ในตัว (ดูหมวด Connector)

### 💬 LINE Messaging
Push Text · Push Image · Push Sticker · Push Flex — แจ้งเตือนเข้า LINE เมื่อ flow ทริกเกอร์

---

## 🚀 การรัน (Development)

> ต้องมี: Node 20+, pnpm, Python 3.13 + venv (`apps/api/venv`) — ฐานข้อมูลเป็น SQLite ในตัว ไม่ต้องตั้ง DB แยกหรือ Docker

```bat
:: เว็บ + backend (SQLite อยู่ในตัว)
start.bat

:: หรือเปิดพร้อมแอป Desktop (Electron)
start-desktop.bat
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

ตั้งค่า Google OAuth + แอดมิน + STT ดูได้ที่ [`docs/AUTH_DESKTOP_SETUP.md`](docs/AUTH_DESKTOP_SETUP.md)

---

<div align="center">
<sub>PhoenixFlow · v0.4.2 · ใช้งานบนเครื่องของคุณเอง 🔥</sub>
</div>
