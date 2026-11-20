# 2026-11-20 — อัปเกรดระบบฐานข้อมูล Supabase และโครงสร้างเอกสารโปรเจกต์

## วัตถุประสงค์
1. เพิ่มระบบจัดการฐานข้อมูล Supabase ที่พร้อมใช้งานสำหรับเครื่องใหม่/เปิดโปรเจกต์ใหม่: มีสคริปต์ SQL Editor สำหรับสร้างตารางทั้งหมด, ข้อมูลตัวอย่าง (Seed), และการรีเซ็ต (Reset)
2. ปรับปรุงการจัดการ Environment Variables และความปลอดภัย: มี `.env.example`, `.env.local`, และ fallback ใน `src/lib/supabase.ts` เพื่อป้องกัน Fatal Crash เมื่อยังไม่ได้กำหนดค่า
3. สร้างสคริปต์ตรวจสอบความสมบูรณ์และทดสอบการเชื่อมต่ออัตโนมัติ: `npm run test:supabase` และ `npm run check`
4. ปรับแต่งโครงสร้างโปรเจกต์และเพิ่มเอกสารคู่มือการติดตั้งที่สมบูรณ์: `SETUP_GUIDE.md`, `README.md`, `supabase/README.md`, `src/types/index.ts`

## สิ่งที่เพิ่มและเปลี่ยนแปลง
- **`supabase/` (โฟลเดอร์สคริปต์ฐานข้อมูลใหม่):**
  - `supabase/schema.sql`: DDL สำหรับสร้าง Extensions, ตาราง `houses`, ตาราง `user_navigation_houses`, วิว `navigation_view`, Indexes, Triggers, และ RLS Policies (รันซ้ำได้แบบ Idempotent)
  - `supabase/seed.sql`: ข้อมูลบ้านตัวอย่าง 10 หลังพร้อมพิกัด GPS จริงในประเทศไทย
  - `supabase/reset.sql`: สคริปต์ล้างตารางทั้งหมดอย่างปลอดภัย
  - `supabase/README.md`: คู่มือการใช้งาน SQL Editor แบบทีละขั้นตอน
  - `supabase-schema.sql`: ไฟล์ alias ที่ root เพื่อความสะดวก
- **`src/lib/supabase.ts`:**
  - ปรับปรุงให้ตรวจสอบ `isSupabaseConfigured` และมี fallback placeholder ป้องกัน Fatal Crash
  - แจ้งเตือนข้อผิดพลาดใน Console แนะนำวิธีแก้ไขอย่างชัดเจน
- **`src/types/index.ts`:**
  - รวม Export ของ `House` และ `NavigationHouse` เพื่อให้เรียกใช้ง่ายและเป็นระเบียบ
- **`scripts/` (สคริปต์อำนวยความสะดวก):**
  - `scripts/test-supabase.mjs`: ตรวจสอบค่า Environment, Ping ไปยัง Supabase, และทดสอบตารางในฐานข้อมูล
  - `scripts/check-project.mjs`: Health Check รัน TypeScript check + ESLint + Supabase test ในคำสั่งเดียว
- **คู่มือและเอกสาร:**
  - `SETUP_GUIDE.md`: คู่มือการติดตั้งและเปิดใช้งานโปรเจกต์บนเครื่องใหม่ทีละขั้นตอน
  - `README.md`: ปรับปรุงใหม่ให้ครอบคลุมฟีเจอร์ โครงสร้างโฟลเดอร์ และคำสั่งต่างๆ
  - `.env.example`: ตัวอย่าง Environment Variables พร้อมคำแนะนำ

## ผลการตรวจสอบ (Verification Evidence)
1. **TypeScript Type Check:**
   - คำสั่ง: `node node_modules/typescript/bin/tsc --noEmit`
   - ผลลัพธ์: ผ่าน 100% ไม่มีข้อผิดพลาด (Zero Errors)
2. **ESLint Check:**
   - คำสั่ง: `npm run lint`
   - ผลลัพธ์: `✔ No ESLint warnings or errors`
3. **Project Health Check:**
   - คำสั่ง: `npm run check`
   - ผลลัพธ์: ผ่านทุกขั้นตอน (TypeScript, ESLint, และ Test Runner)
4. **Supabase Test Script Check:**
   - คำสั่ง: `npm run test:supabase`
   - ผลลัพธ์: ตรวจจับไฟล์ `.env.local` และแสดงคำแนะนำการตั้งค่าอย่างถูกต้อง

## ขอบเขตและข้อควรระวัง
- ไม่มีการแก้ไข business logic หรือ invariant UI ใดๆ (ยังคงขนาด modal, button order, navigation rail และ safe area ตามข้อกำหนด)
- ข้อมูล credentials/keys จริงของผู้ใช้ไม่ถูกบันทึกหรือเก็บลง git (`.env.local` ถูก ignore ตามข้อกำหนด)
