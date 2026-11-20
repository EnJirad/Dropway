# 2026-11-20 — ย้ายระบบฐานข้อมูลเป็น Neon PostgreSQL และเพิ่มระบบ Auto-Schema On CSV Upload

## วัตถุประสงค์
1. รองรับ Neon Serverless PostgreSQL (`@neondatabase/serverless`) เป็นฐานข้อมูลหลักของ DropWay
2. เพิ่มฟังก์ชัน **Auto-Schema Initialization:** เมื่ออัปโหลดไฟล์ CSV หากยังไม่มีตารางในฐานข้อมูล ระบบจะสร้างตาราง `houses`, `user_navigation_houses` และวิว `navigation_view` ให้อัตโนมัติทันที โดยไม่ต้องรันสคริปต์ใน SQL Editor ก่อน
3. นำเข้าข้อมูลตัวอย่างบ้านจริง 27 หลังใน ต.แม่ตาว อ.แม่สอด จ.ตาก ตามที่ผู้ใช้ระบุในรูปแบบ CSV และ SQL Seed
4. สร้าง Server API Routes ใน `src/app/api/` เพื่อจัดการ CRUD ข้อมูลผ่าน Neon อย่างปลอดภัย
5. คงความเข้ากันได้แบบ Dual-Engine (รองรับทั้ง Neon และ Supabase)

## การเปลี่ยนแปลง
- **`src/lib/db.ts` (ใหม่):**
  - จัดการการเชื่อมต่อ Neon Serverless PostgreSQL ผ่าน `DATABASE_URL` / `POSTGRES_URL`
  - ฟังก์ชัน `ensureDatabaseSchema()` สำหรับสร้างตารางและวิวอัตโนมัติแบบ Idempotent
  - ฟังก์ชัน `isNeonConfigured`
- **Server API Routes ใน `src/app/api/` (ใหม่):**
  - `POST /api/houses/upload`: ตรวจสอบและสร้าง Schema อัตโนมัติ, ตรวจสอบ id ซ้ำ, และบันทึกข้อมูล CSV
  - `GET /api/houses` & `POST /api/houses`: ดึงรายการและสร้างบ้านใหม่
  - `PUT /api/houses/[id]` & `DELETE /api/houses/[id]`: อัปเดตและลบบ้าน
  - `GET /api/navigation` & `POST /api/navigation`: ดึงและเพิ่มรายการนำทาง
  - `PUT /api/navigation/[id]` & `DELETE /api/navigation/[id]`: อัปเดตสถานะและลบรายการนำทาง
  - `POST /api/db/init` & `GET /api/db/test`: ตรวจสอบและสร้างฐานข้อมูลทันที
- **หน้าบ้าน (`src/app/houses/page.tsx`, `navigation`, `scan`, `Navbar`):**
  - `importHousesCsv` ส่งข้อมูลไปที่ `/api/houses/upload` เพื่อสร้างตารางอัตโนมัติ
  - `loadHouses` / `reloadHouses` / `fetchNavigation` รองรับการดึงข้อมูลผ่าน Neon API
  - จัดการ Session Bypass สำหรับ Neon Mode เมื่อไม่มี Supabase Auth
- **ไฟล์ข้อมูลและเอกสาร:**
  - `data/sample-houses.csv` และ `public/sample-houses.csv`: ข้อมูลบ้าน 27 หลังตามที่ระบุ
  - `neon/schema.sql`: โค้ด SQL สำหรับ Neon Console พร้อมข้อมูลบ้าน 27 หลัง
  - `neon/README.md`: คู่มือการตั้งค่า Neon Database
  - `scripts/test-neon.mjs`: เครื่องมือทดสอบการเชื่อมต่อ Neon (`npm run test:neon`)
  - `.env.example` และ `.env.local`: เพิ่มการตั้งค่า `DATABASE_URL`

## ผลการตรวจสอบ (Verification Evidence)
- `node node_modules/typescript/bin/tsc --noEmit` → Exit code 0 (Zero Errors)
- `npm run lint` → Exit code 0 (`✔ No ESLint warnings or errors`)
- `npm run test:neon` → ทำงานถูกต้องและแสดงคู่มือการใส่ `DATABASE_URL`
