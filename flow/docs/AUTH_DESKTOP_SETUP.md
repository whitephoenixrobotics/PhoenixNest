# Phoenix Flow — Desktop App + Google Login + Admin Approval + Auto-update

คู่มือนี้อธิบายระบบล็อกอิน (Google), การอนุมัติผู้ใช้, แอป Desktop (Electron) และระบบอัปเดตอัตโนมัติ

---

## ภาพรวมสถาปัตยกรรม

```
Desktop App (Electron)            Backend (FastAPI)            Google
  ├─ ต้องออนไลน์ + ล็อกอิน  ──►  /auth/google/login   ──►  consent screen
  ├─ ใช้ CPU/GPU เครื่องตัวเอง                              │
  └─ phoenixflow:// (deep link) ◄── /auth/google/callback ◄┘ (code → token)
                                       │
                                       └─ ออก JWT + ตรวจสถานะอนุมัติ
```

- **การเทรน/inference** รันบนเครื่องผู้ใช้ (local CPU/GPU) ผ่าน FastAPI backend
- **การล็อกอิน + อนุมัติ** ผ่าน backend (รันเองตอน dev / deploy เป็น central server ตอน production)
- ผู้ใช้ใหม่จะเป็นสถานะ `pending` จนกว่าแอดมินจะกด **อนุมัติ**

สถานะผู้ใช้: `pending` (รออนุมัติ) → `approved` (ใช้งานได้) / `rejected` (ถูกปฏิเสธ)
บทบาท: `user` / `admin`

---

## 1) อัปเดตฐานข้อมูล (Migration)

มีการเพิ่มคอลัมน์ `google_sub`, `picture`, `role`, `status` และทำให้ `hashed_password` เป็น nullable
ผู้ใช้เดิมทั้งหมดจะถูกตั้งเป็น `approved` อัตโนมัติ (กันโดนล็อกเอาท์)

```bash
# เปิด Postgres ก่อน (docker compose up -d) แล้ว:
cd apps/api
venv\Scripts\alembic upgrade head      # Windows
# หรือ:  alembic upgrade head
```

---

## 2) ตั้งค่า Google OAuth

1. ไปที่ <https://console.cloud.google.com> → สร้าง Project
2. **APIs & Services → OAuth consent screen** → ตั้งค่า (External), ใส่ชื่อแอป + email
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs:** ใส่ให้ตรงกับ `GOOGLE_REDIRECT_URI`
     - dev: `http://localhost:8000/auth/google/callback`
     - production: `https://api.your-domain.com/auth/google/callback`
4. คัดลอก **Client ID** และ **Client secret** มาใส่ใน `apps/api/.env`:

```ini
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
FRONTEND_URL=http://localhost:3000
DESKTOP_PROTOCOL=phoenixflow
```

> ถ้าไม่ใส่ `GOOGLE_CLIENT_ID/SECRET` ปุ่ม Google จะขึ้น error 503 (ระบบล็อกอินด้วย email/password ยังใช้ได้ปกติ)

---

## 3) ตั้งแอดมินคนแรก (Bootstrap)

ใส่อีเมลของคุณใน `apps/api/.env` — อีเมลในรายการนี้จะถูกตั้งเป็น `admin` + `approved` อัตโนมัติเมื่อล็อกอินครั้งแรก:

```ini
ADMIN_EMAILS=you@gmail.com,teammate@gmail.com
```

จากนั้นล็อกอินด้วย Google ด้วยอีเมลนั้น → จะเข้าได้ทันทีและเห็นปุ่ม **"จัดการผู้ใช้"** บน Dashboard

---

## 4) รันแบบ Dev

```bash
# 1. Backend + Frontend (เหมือนเดิม)
start.bat
#   หรือแยก:  apps/api → uvicorn app.main:app --reload
#            apps/web → pnpm dev

# 2. Desktop (Electron) — เปิดอีกหน้าต่าง
cd apps/desktop
pnpm install        # ครั้งแรกเท่านั้น (จะโหลด Electron binary)
pnpm start          # โหลด http://localhost:3000 ในหน้าต่าง Electron
```

หรือใช้ `start-desktop.bat` ที่ root (รัน web+api ให้พร้อมก่อน)

**Flow การล็อกอินบน Desktop:**
1. กด "เข้าสู่ระบบด้วย Google" → เปิดเบราว์เซอร์ของเครื่อง
2. ล็อกอิน Google → backend redirect กลับมาที่ `phoenixflow://auth?token=...`
3. Electron จับ deep link → พาเข้าหน้า `/auth/callback` → เข้าระบบ
4. ถ้ายังไม่อนุมัติ → เห็นหน้า "รอการอนุมัติ" (poll อัตโนมัติทุก 5 วิ)

---

## 5) Build ตัวติดตั้ง (Installer)

```bash
cd apps/desktop
pnpm dist          # build ตาม OS ปัจจุบัน → ออกไฟล์ใน apps/desktop/dist/
pnpm dist:win      # บังคับ build Windows (.exe NSIS installer)
```

> ใส่ไอคอนแอปที่ `apps/desktop/build/icon.png` (อย่างน้อย 512×512) ก่อน build เพื่อให้มีไอคอนสวยๆ

**สำคัญ (production):** ตั้ง env ตอน build/run ให้ชี้ไปเซิร์ฟเวอร์จริง:

```ini
PHOENIX_APP_URL=https://app.your-domain.com     # เว็บ UI (Next.js ที่ deploy แล้ว)
PHOENIX_AUTH_URL=https://api.your-domain.com    # เซิร์ฟเวอร์ auth/health (เช็คออนไลน์)
```

> ถ้าต้องการให้แอปรัน frontend + backend ในเครื่องผู้ใช้ทั้งหมด (offline-compute) ต้องแพ็ก
> Next.js (`next start`) และ FastAPI (PyInstaller) เป็น child process — เป็นงานเฟสถัดไป

---

## 6) Auto-update (electron-updater)

ตั้งค่า publish เป็น GitHub Releases แล้ว (`apps/desktop/package.json` → `build.publish`)

1. แก้ `owner`/`repo` ใน `package.json` ให้เป็น repo ของคุณ
2. ตั้ง `GH_TOKEN` (GitHub personal access token) เป็น env
3. เผยแพร่เวอร์ชันใหม่:

```bash
# bump version ใน apps/desktop/package.json ก่อน (เช่น 0.1.0 → 0.1.1)
cd apps/desktop
set GH_TOKEN=ghp_xxx        # Windows
pnpm publish                # build + อัปโหลดขึ้น GitHub Releases
```

แอปที่ติดตั้งแล้วจะเช็คอัปเดตตอนเปิด → ดาวน์โหลดอัตโนมัติ → ขึ้น toast "รีสตาร์ทและติดตั้ง"

---

## API ที่เพิ่มเข้ามา

| Endpoint | คำอธิบาย |
|----------|----------|
| `GET /auth/google/login?mode=web\|desktop` | redirect ไป Google |
| `GET /auth/google/callback` | รับ code, ออก JWT, redirect กลับ |
| `GET /auth/me` | ข้อมูลผู้ใช้ปัจจุบัน (รวม role/status) |
| `GET /admin/users?status=` | (admin) รายชื่อผู้ใช้ |
| `POST /admin/users/{id}/approve` | (admin) อนุมัติ |
| `POST /admin/users/{id}/reject` | (admin) ปฏิเสธ |
| `POST /admin/users/{id}/role` | (admin) ตั้ง/ปลด admin |
| `DELETE /admin/users/{id}` | (admin) ลบผู้ใช้ |

protected resources ใช้ dependency `get_approved_user` → คืน 403 `not_approved`/`rejected`
ให้ frontend พาไปหน้า `/pending` แทนการ logout

REST routers ที่ถูกปิด gate ด้วย approval: `projects`, `flows`, `models`, `train`, `train_detect`

**WebSocket** (`/ws/executions/{id}`, `/ws/live-detect`) ปิด gate ด้วย JWT ผ่าน query param
`?token=<jwt>` (เบราว์เซอร์ใส่ Authorization header บน WS ไม่ได้) + ต้องเป็น `approved` —
ไม่ผ่านจะถูกปิดด้วย close code **4401** (ดู `app/auth/ws.py`)

---

## ข้อจำกัด / งานเฟสถัดไป

- **แพ็กแบบ offline เต็มรูปแบบ**: ปัจจุบัน Electron โหลด UI จาก `PHOENIX_APP_URL` (dev = localhost:3000)
  หากต้องการให้ผู้ใช้รัน frontend + backend ในเครื่องตัวเองทั้งหมด ต้อง bundle
  Next.js (`next start`) + FastAPI (PyInstaller) เป็น child process ของ Electron — เป็นงานเฟสถัดไป
- ใส่ไอคอนแอปที่ `apps/desktop/build/icon.png` ก่อน build installer
- แก้ `owner`/`repo` ใน `apps/desktop/package.json` (`build.publish`) ให้เป็น GitHub repo จริงก่อนใช้ auto-update

## สิ่งที่ verify แล้ว (ผ่าน)

- Alembic migration รันบน Postgres สำเร็จ (ผู้ใช้เดิม 3 คน → approved)
- Endpoint ใหม่ลงทะเบียนครบ; pending → `/projects` คืน 403 `not_approved`
- `ADMIN_EMAILS` auto-promote เป็น admin+approved; admin อนุมัติแล้วผู้ใช้เข้าได้ (200)
- **WebSocket**: no token / bad token / pending → close 4401; approved → เชื่อมต่อได้
- Frontend: `tsc --noEmit` + `eslint` ผ่านสะอาด
- Electron `main.js`/`preload.js`: syntax ผ่าน (`node --check`)
