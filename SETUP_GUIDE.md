# 📖 คู่มือการติดตั้งและเริ่มต้นใช้งาน DropWay (Neon PostgreSQL Setup Guide)

คู่มือนี้จัดทำขึ้นเพื่อให้คุณสามารถนำโปรเจกต์ **DropWay** ไปเปิดใช้งานบนเครื่องคอมพิวเตอร์เครื่องใหม่, เซิร์ฟเวอร์ใหม่ หรือสภาพแวดล้อมใหม่ ได้อย่างง่ายดายและราบรื่นที่สุด โดยใช้ **Neon Serverless PostgreSQL** เป็นฐานข้อมูลหลักเพียงแห่งเดียว

---

## 📋 สิ่งที่ต้องเตรียมก่อนเริ่มต้น (Prerequisites)

1. **Node.js**: เวอร์ชัน 18 ขึ้นไป (แนะนำ Node.js 20 หรือ 22 LTS)
2. **Git**: ติดตั้งบนเครื่องของคุณ
3. **บัญชี Neon**: สมัครฟรีได้ที่ [neon.tech](https://neon.tech)

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

### ขั้นตอนที่ 3: รับ Connection String จาก Neon

1. เข้าไปที่ [Neon Console](https://console.neon.tech)
2. กดปุ่ม **"Create Project"** (เลือก Region ที่ใกล้ประเทศไทยที่สุด เช่น `ap-southeast-1` Singapore หรือ `aws-ap-southeast-1`)
3. ที่หน้า Dashboard หัวข้อ **"Connection Details"** ให้เลือกแท็บ **"Connection string"**
4. คัดลอกข้อความ Connection string มา เช่น:
   ```text
   postgresql://neondb_owner:npg_xxxxxxxxxxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

> 💡 **หมายเหตุสำคัญ:** คุณไม่จำเป็นต้องเข้าไปกดรันคำสั่ง SQL สร้างตารางล่วงหน้า เพราะ DropWay มีระบบ **Auto-Schema Creation** เมื่อคุณอัปโหลดไฟล์ CSV ผ่านหน้าเว็บ ระบบจะสร้างตาราง `houses`, `user_navigation_houses`, วิว `navigation_view` และ Index ทั้งหมดให้อัตโนมัติทันที หรือหากต้องการสร้างด้วยตนเองสามารถนำสคริปต์จาก [`neon/schema.sql`](./neon/schema.sql) ไปรันที่ Neon SQL Editor ได้เช่นกัน

---

### ขั้นตอนที่ 4: ตั้งค่าไฟล์ Environment Variables (`.env.local`)

1. คัดลอกไฟล์เทมเพลต:
   ```bash
   cp .env.example .env.local
   ```
2. เปิดไฟล์ `.env.local` ในโปรเจกต์แล้วใส่ค่า `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://neondb_owner:your-password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
3. บันทึกไฟล์

---

### ขั้นตอนที่ 5: ทดสอบการเชื่อมต่อและเริ่มรันเว็บ

1. **รันทดสอบการเชื่อมต่อ Neon:**
   ```bash
   npm run test:neon
   ```
   *เมื่อการเชื่อมต่อถูกต้อง จะขึ้นข้อความสีเขียว `✓` ยืนยันการเชื่อมต่อและสถานะตาราง*

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
| `npm run test:neon` | ทดสอบการเชื่อมต่อ Neon PostgreSQL และโครงสร้างตาราง |
| `npm run check` | ตรวจสอบความถูกต้องของโปรเจกต์ทั้งหมด (Types + Lint + Neon DB) |
| `npm run lint` | ตรวจสอบคุณภาพโค้ดด้วย ESLint |

---

## ❓ การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)

### 1. หน้าเว็บแจ้งเตือนว่ายังไม่ได้ตั้งค่า DATABASE_URL
- **สาเหตุ:** ยังไม่ได้สร้างไฟล์ `.env.local` หรือยังไม่ได้ระบุค่า Connection String
- **วิธีแก้:** ตรวจสอบว่ามีไฟล์ `.env.local` อยู่ที่ root ของโปรเจกต์ และมีบรรทัด `DATABASE_URL=postgresql://...`

### 2. รัน `npm run test:neon` แล้วขึ้นแจ้งเตือนว่ายังไม่มีตาราง
- **สาเหตุ:** เป็นฐานข้อมูลที่สร้างใหม่
- **วิธีแก้:** สามารถเข้าหน้าเว็บ `/houses` แล้วกด "นำเข้า CSV" เพื่อเลือกไฟล์ตัวอย่าง [data/sample-houses.csv](./data/sample-houses.csv) ระบบจะสร้างตารางและบันทึกข้อมูล 27 จุดส่งให้ทันทีอัตโนมัติ
