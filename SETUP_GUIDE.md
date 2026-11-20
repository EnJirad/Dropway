# 📖 คู่มือการติดตั้งและเริ่มต้นใช้งาน DropWay สำหรับเครื่องใหม่ (Setup Guide)

คู่มือนี้จัดทำขึ้นเพื่อให้คุณสามารถนำโปรเจกต์ **DropWay** ไปเปิดใช้งานบนเครื่องคอมพิวเตอร์เครื่องใหม่, เซิร์ฟเวอร์ใหม่ หรือสภาพแวดล้อมใหม่ ได้อย่างง่ายดายและราบรื่นที่สุด

---

## 📋 สิ่งที่ต้องเตรียมก่อนเริ่มต้น (Prerequisites)

1. **Node.js**: เวอร์ชัน 18 ขึ้นไป (แนะนำ Node.js 20 หรือ 22 LTS)
2. **Git**: ติดตั้งบนเครื่องของคุณ
3. **บัญชี Supabase**: สมัครฟรีได้ที่ [supabase.com](https://supabase.com)

---

## 🚀 5 ขั้นตอนในการตั้งค่าและรันโปรเจกต์บนเครื่องใหม่

### ขั้นตอนที่ 1: โคลนโค้ดและเข้าสู่โฟลเดอร์โปรเจกต์
```bash
git clone https://github.com/EnJirad/Dropway.git
cd Dropway
```

### ขั้นตอนที่ 2: ติดตั้ง Dependencies
```bash
npm install
```

---

### ขั้นตอนที่ 3: สร้างและเตรียมฐานข้อมูลบน Supabase

1. เข้าไปที่ [Supabase Dashboard](https://supabase.com/dashboard)
2. กดปุ่ม **"New project"** (ตั้งชื่อโปรเจกต์ เช่น `dropway-db` และตั้ง Database Password)
3. เมื่อสร้างโปรเจกต์เสร็จสมบูรณ์ ให้ไปที่เมนู **SQL Editor** ที่แถบเมนูด้านซ้าย (ไอคอน `>_`)
4. กด **+ New query**
5. เปิดไฟล์ [`supabase/schema.sql`](./supabase/schema.sql) ในโปรเจกต์นี้ คัดลอกเนื้อหาทั้งหมดไปวางในช่อง SQL Query
6. กดปุ่ม **Run** เพื่อสร้างตาราง `houses`, `user_navigation_houses`, วิว `navigation_view`, Indexes และ RLS Policies ทั้งหมด
7. *(ทางเลือก)* หากต้องการข้อมูลบ้านตัวอย่าง 10 หลังเพื่อทดสอบทันที:
   - เปิดไฟล์ [`supabase/seed.sql`](./supabase/seed.sql)
   - นำไปวางใน SQL Editor แล้วกด **Run**

---

### ขั้นตอนที่ 4: ตั้งค่าไฟล์ Environment Variables (`.env.local`)

1. คัดลอกไฟล์เทมเพลต:
   ```bash
   cp .env.example .env.local
   ```
2. เปิด Supabase Dashboard -> ไปที่ **Project Settings** (ไอคอนฟันเฟืองล่างซ้าย) -> เมนู **API**
3. คัดลอกค่า 2 ตัวนี้:
   - **Project URL** (เช่น `https://xyzcompany.supabase.co`)
   - **Project API Keys** (เลือกตัวที่เป็น `anon` `public`)
4. เปิดไฟล์ `.env.local` ในโปรเจกต์แล้วใส่ค่าลงไป:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
5. บันทึกไฟล์

---

### ขั้นตอนที่ 5: ทดสอบการเชื่อมต่อและเริ่มรันเว็บ

1. **รันทดสอบการเชื่อมต่อ Supabase:**
   ```bash
   npm run test:supabase
   ```
   *เมื่อการเชื่อมต่อถูกต้อง จะขึ้นข้อความสีเขียว `✓` ยืนยันการเชื่อมต่อตารางทั้งหมด*

2. **เริ่มรัน Development Server:**
   ```bash
   npm run dev
   ```
3. เปิดเว็บเบราว์เซอร์ไปที่: [http://localhost:3000](http://localhost:3000)

---

## 🛠️ คำสั่งที่พร้อมใช้งานในโปรเจกต์ (Useful Commands)

| คำสั่ง | คำอธิบาย |
|---|---|
| `npm run dev` | รันเว็บสำหรับพัฒนา (Development Mode) |
| `npm run build` | บิลด์โค้ดสำหรับนำขึ้น Production |
| `npm run start` | รันเซิร์ฟเวอร์หลังจากการบิลด์เสร็จ |
| `npm run test:supabase` | ทดสอบการเชื่อมต่อ Supabase และโครงสร้างตาราง |
| `npm run check` | ตรวจสอบความถูกต้องของโปรเจกต์ทั้งหมด (Types + Lint + DB) |
| `npm run lint` | ตรวจสอบคุณภาพโค้ดด้วย ESLint |

---

## ❓ การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)

### 1. หน้าเว็บแจ้งเตือนว่าไม่พบการตั้งค่า Supabase หรือล็อกอินไม่ได้
- **สาเหตุ:** ยังไม่ได้สร้างไฟล์ `.env.local` หรือยังไม่ได้ระบุค่า URL / Key
- **วิธีแก้:** ตรวจสอบว่ามีไฟล์ `.env.local` อยู่ที่ root ของโปรเจกต์ และชื่อตัวแปรสะกดถูกต้อง (`NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### 2. สมัครสมาชิกแล้ว แต่ล็อกอินไม่ได้ (Email not confirmed)
- **สาเหตุ:** การตั้งค่าเริ่มต้นของ Supabase ต้องกดยืนยันอีเมลก่อนเข้าใช้งาน
- **วิธีแก้:** เข้าไปที่ Supabase Dashboard -> **Authentication** -> **Providers** -> **Email** -> ปิดสวิตช์ **"Confirm email"** หากต้องการให้ผู้ใช้สมัครแล้วล็อกอินได้ทันทีโดยไม่ต้องรอยืนยันอีเมล

### 3. รัน `npm run test:supabase` แล้วขึ้นสีแดงว่าไม่พบตาราง
- **สาเหตุ:** ยังไม่ได้รันคำสั่งใน `supabase/schema.sql`
- **วิธีแก้:** เปิดไฟล์ `supabase/schema.sql` แล้วนำไปรันใน Supabase SQL Editor
