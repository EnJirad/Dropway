# 🚚 DropWay — ระบบจัดการคลังบ้านและการนำทางจัดส่งพัสดุ

เว็บแอปพลิเคชันสำหรับจัดการคลังบ้าน ที่อยู่ผู้รับ และวางแผนเส้นทางจัดส่งพัสดุ ออกแบบมาเพื่อการใช้งานบนสมาร์ทโฟนของคนขับรถจัดส่ง (Driver-Friendly) พัฒนาด้วย Next.js 14 App Router, TypeScript, Tailwind CSS และ **Neon Serverless PostgreSQL**

---

## ✨ ฟีเจอร์หลัก (Key Features)

- 🏠 **คลังบ้าน (House Catalog):** ค้นหาและคัดกรองข้อมูลผู้รับตาม ชื่อ, เบอร์โทร, อำเภอ/ตำบล, เลขที่บ้าน พร้อมระบบจัดอันดับความตรงของผลการค้นหา
- 🧭 **ระบบนำทางสำหรับคนขับ (One-Handed Navigation):** แถบปุ่มสั่งการแนวตั้งออกแบบสำหรับการใช้งานมือเดียว (สลับซ้าย/ขวาได้), รองรับสถานะ ส่งแล้ว, เลื่อนส่ง, รายงานปัญหา, บันทึกการโทร และนำทางตรงผ่าน Google Maps
- 📷 **สแกน QR Code / บาร์โค้ด (/scan):** สแกน QR พัสดุเพื่อค้นหาบ้านในระบบ และเพิ่มเข้าสู่คิวจัดส่งหรือกดนำทางทันที
- 📊 **นำเข้า / ส่งออก CSV พร้อมระบบ Auto-Schema:** นำเข้าไฟล์ CSV จุดส่งของ (27 จุดส่งแม่สอด หรือข้อมูลของคุณเอง) โดยระบบจะสร้างตารางและ View บน Neon ให้อัตโนมัติทันที
- ⚡ **Neon Serverless PostgreSQL:** ใช้ฐานข้อมูล Neon ผ่าน Server Route Handlers รวดเร็ว ไม่ต้องกังวลเรื่องการเชื่อมต่อหลุด

---

## 🔐 API key ของ AI (BYOK — เข้ารหัสก่อนเก็บในฐานข้อมูล)

โปรเจกต์นี้ **ไม่มี API key ฝังในโค้ดหรือ `.env`** — ผู้ใช้กรอกเองที่หน้า *ตั้งค่า → AI อ่านรูป*

- กด **บันทึก** ครั้งเดียว → key ถูกเข้ารหัสด้วย AES-256-GCM แล้วเก็บในตาราง `ai_settings`
- คีย์เข้ารหัสมาจาก `AI_KEYS_SECRET` ถ้าไม่ได้ตั้ง ระบบจะ **สร้าง secret สุ่มเก็บในตาราง `app_secrets` ให้อัตโนมัติ** (ใช้ได้ทันที; production แนะนำตั้ง env เอง)
- ครั้งถัดไป (แม้รีเฟรช/เปิดเครื่องใหม่) สแกนได้ทันที — เซิร์ฟเวอร์ดึง key ที่บันทึกไว้มาใช้เอง
- ฝั่งเบราว์เซอร์เก็บ key ในหน่วยความจำแท็บเท่านั้น และ **ไม่เคยได้รับ key กลับจากเซิร์ฟเวอร์** (เห็นแค่ `••••1234`)
- ถ้าไม่มีทั้ง env และฐานข้อมูล ระบบจะไม่ยอมเก็บ key (ไม่มีการเก็บ plaintext เด็ดขาด)
- ถ้า key หลักติดลิมิต/โควตา (429) จะสลับไป key สำรองให้เอง

ตรวจก่อน push ทุกครั้ง (กัน secret หลุดเข้า git):

```bash
npm run security:scan
```

คำสั่งนี้อยู่ใน `npm run check` แล้ว และจะ fail ถ้าพบ key ในไฟล์ที่ git ติดตาม

---

## 🏗️ สถาปัตยกรรมและโครงสร้างโปรเจกต์ (Project Structure)

```text
dropway/
├── .ai/                    # เอกสารระบบ AI Agent และประวัติการเปลี่ยนแปลง
├── data/                   # ชุดข้อมูลตัวอย่าง (sample-houses.csv)
├── neon/                   # 🗄️ สคริปต์ฐานข้อมูล Neon PostgreSQL
│   ├── README.md           # คู่มือการใช้งาน Neon Console และ SQL Editor
│   └── schema.sql          # สคริปต์สร้างตาราง, วิว, อินเด็กซ์ และ Seed ข้อมูลแม่สอด 27 จุด
├── public/                 # รูปภาพและ Assets สแตติก
├── scripts/                # สคริปต์ตัวช่วยและการทดสอบระบบ
│   ├── check-project.mjs   # ตรวจสอบ Health Check ทั้งระบบ (Types + Lint + Neon DB)
│   └── test-neon.mjs       # ตรวจสอบการเชื่อมต่อ Neon Database
├── src/
│   ├── app/                # Next.js App Router Pages & API Routes
│   │   ├── api/            # Server Route Handlers เชื่อมต่อ Neon DB
│   │   │   ├── houses/     # API จัดการข้อมูลบ้าน และ CSV Upload
│   │   │   ├── navigation/ # API จัดการคิวการนำทาง
│   │   │   └── db/init/    # API ทดสอบและสร้าง Schema อัตโนมัติ
│   │   ├── houses/         # หน้าคลังบ้าน จัดการและค้นหา
│   │   ├── login/          # หน้าเข้าสู่ระบบ
│   │   ├── navigation/     # หน้านำทางสำหรับคนขับรถ
│   │   ├── register/       # หน้าสมัครสมาชิก
│   │   ├── scan/           # หน้าสแกน QR / Barcode
│   │   ├── globals.css     # สไตล์หลักและ Tailwind Utilities
│   │   └── layout.tsx      # รูทเลย์เอาต์พร้อมแถบนำทาง
│   ├── components/         # คอมโพเนนต์ส่วนกลาง (Navbar, Drawer ฯลฯ)
│   ├── lib/                # ยูทิลิตี้และคอนฟิก (db.ts เชื่อมต่อ Neon, Viewport Hook)
│   └── types/              # นิยาม TypeScript Interfaces ทั้งหมด
├── .env.example            # ตัวอย่างการตั้งค่าตัวแปรสภาพแวดล้อม (DATABASE_URL)
├── SETUP_GUIDE.md          # 📖 คู่มือการติดตั้งอย่างละเอียดทีละขั้นตอน
└── package.json            # การจัดการ Dependencies และ Scripts
```

---

## ⚡ เริ่มต้นใช้งานด่วน (Quick Start)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่าฐานข้อมูล Neon
1. สมัครใช้งานและสร้างโปรเจกต์ที่ [Neon Console](https://console.neon.tech)
2. คัดลอก Connection String จากหน้า Dashboard (Connection Details)

### 3. ตั้งค่า `.env.local`
คัดลอกไฟล์ตัวอย่าง:
```bash
cp .env.example .env.local
```
นำค่า Connection String มาใส่ใน `.env.local`:
```env
DATABASE_URL=postgresql://neondb_owner:your-password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### 4. ตรวจสอบการเชื่อมต่อ
```bash
npm run test:neon
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
npm run test:neon      # ทดสอบการเชื่อมต่อ Neon Database
npm run check          # ตรวจสอบความสมบูรณ์ของโปรเจกต์ทั้งหมด (Health Check)
```
