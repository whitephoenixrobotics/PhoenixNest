<div align="center">

# 🔥 Phoenix Flow

**AI Block-based Platform — สร้าง AI workflow แบบลากวาง ไม่ต้องเขียนโค้ด**

ลากบล็อกมาต่อกันบน canvas → เชื่อมเป็น pipeline → รันได้ทันที
เทรนโมเดล AI ของตัวเองได้ในเครื่อง (ใช้ CPU/GPU ของคุณเอง)

</div>

---

## Phoenix Flow คืออะไร

Phoenix Flow คือแพลตฟอร์มสร้าง AI แบบ **block-based** (คล้าย Scratch / Node-RED แต่เน้น AI/Computer Vision) —
ผู้ใช้ลากบล็อกมาต่อกันบน canvas เพื่อสร้าง workflow เช่น *กล้อง → ตรวจจับวัตถุ → แสดงผล* โดยไม่ต้องเขียนโปรแกรม

จุดเด่น:
- 🎨 **Visual editor** — ลากวางบล็อก เชื่อมเส้น เห็นผลแบบ real-time (React Flow)
- 🧠 **เทรน AI เองได้** — TrainAI สอนโมเดลจำแนกภาพ/ตรวจจับวัตถุจากรูปของคุณเอง
- 💻 **ใช้เครื่องตัวเอง** — การประมวลผล/เทรนรันบน CPU/GPU ในเครื่อง (offline, ไม่ส่งข้อมูลขึ้น cloud)
- 🔐 **ควบคุมผู้ใช้** — ล็อกอิน Google + ระบบอนุมัติโดยแอดมิน
- 🖥️ **Desktop App** — Electron พร้อม auto-update

---

## สถาปัตยกรรม (Tech Stack)

| ส่วน | เทคโนโลยี |
|------|-----------|
| Frontend | Next.js 16 + React 19 + React Flow (`@xyflow/react`) + Tailwind |
| Backend | FastAPI + SQLAlchemy (async) + Alembic |
| Database | PostgreSQL + Redis (Docker) |
| Desktop | Electron + electron-updater |
| Auth | Google OAuth (ผ่าน backend) + JWT + ระบบอนุมัติ |
| AI / ML | PyTorch (CUDA), Ultralytics YOLOv8, OpenCV, EasyOCR, OpenCLIP, MediaPipe, faster-whisper |

โครงสร้าง monorepo (pnpm + turbo): `apps/web` (UI) · `apps/api` (backend + AI engine) · `apps/desktop` (Electron)

---

## ✨ ฟีเจอร์หลัก (เวอร์ชันนี้ · v0.4.1)

- **Flow Editor** — สร้าง/บันทึก/รัน workflow บน canvas, รันสด (live) ผ่าน WebSocket
- **TrainAI** — เทรนโมเดลเอง 2 แบบ:
  - 🏷️ **จำแนกภาพ** (Classification) — ถ่าย/อัปโหลดรูปแยกคลาส แล้วเทรน
  - 🎯 **ตรวจจับวัตถุ** (Detection) — ตีกรอบ (วาดเอง/ให้ AI ช่วย) แล้วเทรน YOLO
  - มี Data Augmentation, เลือก base model, ทดสอบโมเดล, ดาวน์โหลด `.pt`
- **Auth & ผู้ใช้** — ล็อกอิน Google, ผู้ใช้ใหม่ต้องรอแอดมิน **อนุมัติ**, หน้าจัดการผู้ใช้สำหรับแอดมิน
- **Desktop App** — Electron (ต้องออนไลน์ + ล็อกอิน), auto-update ผ่าน GitHub Releases
- **Speech to Text** — ถอดเสียงเป็นข้อความแบบ offline ด้วย faster-whisper (ภาษาไทย, ใช้ GPU, มีโหมดถอดสด/อัดแล้วถอด + เลือกขนาดโมเดล)

---

## 🧰 เครื่องมือ (บล็อก) ที่ใช้ได้ใน v0.4.1

รวม **~56 บล็อก** ใน 11 หมวด:

### 📥 Input — รับข้อมูลเข้า
| บล็อก | หน้าที่ |
|-------|---------|
| Upload Image | อัปโหลดภาพจากเครื่อง |
| Webcam | ถ่ายภาพจากกล้อง |
| Text | พิมพ์ข้อความ |
| Switch | สวิตช์เปิด/ปิด (True/False) |
| Button | ปุ่มกดชั่วคราว (True ตอนกด) |
| Hotkey | ปุ่มลัดบนคีย์บอร์ด |
| Speech to Text | พูด → ข้อความ (faster-whisper) |
| Color | เลือกสี → RGB |
| HTTP Fetch | ดึงข้อมูลจาก URL |
| วาดรูป | วาดด้วยเมาส์ → ส่งเป็นภาพ |

### 🔍 ข้อมูล
| บล็อก | หน้าที่ |
|-------|---------|
| JSON Extract | ดึงค่าจาก JSON ตาม path |

### 🔢 คณิตศาสตร์
| บล็อก | หน้าที่ |
|-------|---------|
| ตัวเลข | จำนวนเต็ม/ทศนิยม |
| สุ่ม | สุ่มตัวเลขในช่วง |
| คำนวณ | + − × ÷ % |

### ⏰ เวลา
| บล็อก | หน้าที่ |
|-------|---------|
| หน่วงเวลา | รอ True ต่อเนื่อง N วินาที |
| ตั้งเวลา | True เมื่อถึงวัน/เวลา |

### 🔀 ตรรกะ (Logic)
If/Else · Compare · Counter · Toggle · Trigger Once · Hold

### 🔌 Logic Gates
AND · OR · NOT · NAND · NOR · XOR · XNOR

### 🤖 AI
| บล็อก | หน้าที่ |
|-------|---------|
| Detect (YOLO) | ตรวจจับวัตถุในภาพ |
| Image Classifier | สอน AI ด้วยภาพตัวอย่าง |
| Pose | ตรวจท่าทาง (ยกมือ/T-pose/ชี้/ยืน-นั่ง) |
| นับวัตถุ | นับจาก Detect ตามชนิด |
| ตรวจจับสี | หาสีเด่นในภาพ |
| OCR | อ่านตัวอักษรจากภาพ (ไทย+อังกฤษ) |
| อ่านตัวเลข (MNIST) | จำแนกเลขเขียนมือ 0–9 |

### 🎭 AI · ใบหน้า
| บล็อก | หน้าที่ |
|-------|---------|
| โครงใบหน้า | ตรวจหาใบหน้า + 478 จุด |
| นับจำนวนใบหน้า | นับใบหน้าในภาพ |
| รอยยิ้ม | ตรวจจับรอยยิ้ม |
| จดจำใบหน้า | สอน AI ให้รู้จักคน |
| อารมณ์ | ตรวจอารมณ์จากสีหน้า |

### 🧠 Deep Learning
| บล็อก | หน้าที่ |
|-------|---------|
| DeepDetect | รันโมเดล detect ที่เทรนเอง (`.pt`/`.onnx`) |
| DeepClassifier | รันโมเดลจำแนกภาพที่เทรนเอง (`.pt`/`.onnx`) |

### 🎨 แก้ไขภาพ
Brightness · Contrast · Saturation · Sharpen · Blur · Grayscale · Invert · RGB Adjust · Style Transfer · แยกฉากหลัง (Segmentation)

### 📤 Output — แสดงผล
| บล็อก | หน้าที่ |
|-------|---------|
| Display | แสดงผลลัพธ์บน canvas |
| Light Bulb | ติด=True / ดับ=False |
| Text to Speech | อ่านข้อความออกเสียงเมื่อ True |

---

## 🚀 การรัน (Development)

> ต้องมี: Node 20+, pnpm, Python 3.13 + venv (`apps/api/venv`), Docker Desktop

```bat
:: เว็บ + backend + ฐานข้อมูล
start.bat

:: หรือเปิดพร้อมแอป Desktop (Electron)
start-desktop.bat
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

ตั้งค่า Google OAuth + แอดมิน + STT ดูได้ที่ [`docs/AUTH_DESKTOP_SETUP.md`](docs/AUTH_DESKTOP_SETUP.md)

---

<div align="center">
<sub>Phoenix Flow · v0.4.1 · ใช้งานบนเครื่องของคุณเอง 🔥</sub>
</div>
