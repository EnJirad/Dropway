# 🚚 DropWay — ระบบจัดการคลังบ้านและการนำทางจัดส่งพัสดุ

เว็บแอปพลิเคชันสำหรับจัดการคลังบ้าน ที่อยู่ผู้รับ และวางแผนเส้นทางจัดส่งพัสดุ ออกแบบมาเพื่อการใช้งานบนสมาร์ทโฟนของคนขับรถจัดส่ง (Driver-Friendly) พัฒนาด้วย Next.js 14 App Router, TypeScript, Tailwind CSS และ Supabase

---

## ✨ ฟีเจอร์หลัก (Key Features)

- 🏠 **คลังบ้าน (House Catalog):** ค้นหาและคัดกรองข้อมูลผู้รับตาม ชื่อ, เบอร์โทร, อำเภอ/ตำบล, เลขที่บ้าน พร้อมระบบจัดอันดับความตรงของผลการค้นหา
- 🧭 **ระบบนำทางสำหรับคนขับ (One-Handed Navigation):** แถบปุ่มสั่งการแนวตั้งออกแบบสำหรับการใช้งานมือเดียว (สลับซ้าย/ขวาได้), รองรับสถานะ ส่งแล้ว, เลื่อนส่ง, รายงานปัญหา, บันทึกการโทร และนำทางตรงผ่าน Google Maps
- 📷 **สแกน QR Code / บาร์โค้ด (/scan):** สแกน QR พัสดุเพื่อค้นหาบ้านในระบบ และเพิ่มเข้าสู่คิวจัดส่งหรือกดนำทางทันที
- 📊 **นำเข้า / ส่งออก CSV:** ดาวน์โหลดข้อมูลบ้านทั้งหมดเป็น CSV หรืออัปโหลดไฟล์ CSV เข้าสู่ระบบพร้อมระบบตรวจจับและข้ามรายการซ้ำ (Duplicate-Safe)
- 🔒 **ความปลอดภัยสูง:** รองรับ Supabase Auth และ Row Level Security (RLS) แยกข้อมูลนำทางของผู้ใช้แต่ละคนอย่างปลอดภัย

---

## 🏗️ สถาปัตยกรรมและโครงสร้างโปรเจกต์ (Project Structure)

```text
dropway/
├── .ai/                    # เอกสารระบบ AI Agent และประวัติการเปลี่ยนแปลง
├── public/                 # รูปภาพและ Assets สแตติก
├── scripts/                # สคริปต์ตัวช่วยและการทดสอบระบบ
│   ├── check-project.mjs   # ตรวจสอบ Health Check ทั้งระบบ (Types + Lint + DB)
│   └── test-supabase.mjs   # ตรวจสอบการเชื่อมต่อ Supabase Database & Auth
├── src/
│   ├── app/                # Next.js App Router Pages
│   │   ├── houses/         # หน้าคลังบ้าน จัดการและค้นหา
│   │   ├── login/          # หน้าเข้าสู่ระบบ
│   │   ├── navigation/     # หน้านำทางสำหรับคนขับรถ
│   │   ├── register/       # หน้าสมัครสมาชิก
│   │   ├── scan/           # หน้าสแกน QR / Barcode
│   │   ├── globals.css     # สไตล์หลักและ Tailwind Utilities
│   │   └── layout.tsx      # รูทเลย์เอาต์พร้อมแถบนำทาง
│   ├── components/         # คอมโพเนนต์ส่วนกลาง (Navbar, Drawer ฯลฯ)
│   ├── lib/                # ยูทิลิตี้และคอนฟิก (Supabase Client, Viewport Hook)
│   └── types/              # นิยาม TypeScript Interfaces ทั้งหมด
├── supabase/               # 🗄️ สคริปต์ฐานข้อมูล Supabase
│   ├── README.md           # คู่มือการใช้งาน SQL Editor
│   ├── reset.sql           # สคริปต์ล้างตารางเพื่อสร้างใหม่
│   ├── schema.sql          # สคริปต์สร้างตาราง, วิว, อินเด็กซ์, และ RLS ทั้งหมด
│   └── seed.sql            # ข้อมูลตัวอย่าง 10 หลังพร้อมพิกัด GPS จริง
├── .env.example            # ตัวอย่างการตั้งค่าตัวแปรสภาพแวดล้อม
├── SETUP_GUIDE.md          # 📖 คู่มือการติดตั้งอย่างละเอียดทีละขั้นตอน
└── package.json            # การจัดการ Dependencies และ Scripts
```

---

## ⚡ เริ่มต้นใช้งานด่วน (Quick Start)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่าฐานข้อมูล Supabase
1. เข้า [Supabase Dashboard](https://supabase.com/dashboard) -> สร้างโปรเจกต์ใหม่
2. ไปที่ **SQL Editor** -> นำเนื้อหาจากไฟล์ [`supabase/schema.sql`](./supabase/schema.sql) ไปวางแล้วกด **Run**
3. *(ทางเลือก)* นำไฟล์ [`supabase/seed.sql`](./supabase/seed.sql) ไปรันเพื่อเพิ่มข้อมูลทดสอบ 10 หลัง

### 3. ตั้งค่า `.env.local`
คัดลอกไฟล์ตัวอย่าง:
```bash
cp .env.example .env.local
```
นำค่า **Project URL** และ **anon public key** จาก Supabase Dashboard (Settings -> API) มาใส่ใน `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 4. ตรวจสอบการเชื่อมต่อ
```bash
npm run test:supabase
```

### 5. รันเซิร์ฟเวอร์
```bash
npm run dev
```
เปิดเบราว์เซอร์ไปที่: [http://localhost:3000](http://localhost:3000)

> 📖 ดูคู่มือการติดตั้งฉบับสมบูรณ์ได้ที่ [**SETUP_GUIDE.md**](./SETUP_GUIDE.md)

---

## 💻 คำสั่งสคริปต์ที่พร้อมใช้งาน

```bash
npm run dev            # เริ่มต้น Local Development Server
npm run build          # บิลด์สำหรับ Production
npm run start          # รัน Production Server
npm run lint           # ตรวจสอบสไตล์โค้ดด้วย ESLint
npm run test:supabase  # ทดสอบการเชื่อมต่อ Supabase Database & Auth
npm run check          # ตรวจสอบความสมบูรณ์ของโปรเจกต์ทั้งหมด (Health Check)
```

---

## 🤖 ระบบเอกสาร AI Agent

โปรเจกต์นี้มีระบบเอกสารมาตรฐานสำหรับ AI Agent อยู่ในโฟลเดอร์ `.ai/`:
- `.ai/AI_RULES.md` — กฎระเบียบข้อบังคับสำหรับ AI Agent
- `.ai/AI_HANDOFF.md` — คู่มือเริ่มต้นเซสชันใหม่
- `.ai/PROJECT_CONTEXT.md` — บริบทภาพรวมของโปรเจกต์
- `.ai/CURRENT_STATE.md` — บันทึกสถานะปัจจุบันล่าสุด
- `.ai/CHANGELOG.md` — ประวัติการเปลี่ยนแปลงสำคัญ
- `.ai/reports/` — รายงานผลการตรวจสอบและการทดสอบระบบ
