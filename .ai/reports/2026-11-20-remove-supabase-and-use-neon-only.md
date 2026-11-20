# รายงานการถอด Supabase และเปลี่ยนมาใช้ Neon PostgreSQL เพียงแห่งเดียว 100%
**วันที่:** 20 พฤศจิกายน 2026
**โปรเจกต์:** DropWay (`wise-lovelace`)

---

## 1. วัตถุประสงค์ (Objective)
ตามคำสั่งของผู้ใช้:
> "คือเราจะไม่ใช้ supabase อีกต่อไป ให้เอาออกเลย เราจะใช้ ถังเก็บข้อมูลแค่ที่เดียวนั่นก็คือ Neon เท่านั้น"

ทำการถอด Supabase ทั้งหมดออกจากโปรเจกต์ ทั้งไลบรารี, สคริปต์, เอกสาร, ไฟล์ DDL, และการเรียกใช้งานในโค้ด โดยเปลี่ยนมาใช้ **Neon Serverless PostgreSQL** เป็นฐานข้อมูลหลักเพียงแห่งเดียว 100%

---

## 2. การดำเนินการและไฟล์ที่แก้ไข (Summary of Changes)

### 2.1 ถอด Dependencies และสคริปต์ Supabase
- รัน `npm uninstall @supabase/supabase-js @supabase/ssr` (ถอด 10 แพ็กเกจออก)
- ปรับปรุง [package.json](file:///workspace/wise-lovelace/package.json): ลบสคริปต์ `test:supabase` เหลือเฉพาะ `test:neon` และ `db:test`
- ลบไฟล์:
  - `src/lib/supabase.ts`
  - `scripts/test-supabase.mjs`
  - `supabase-schema.sql`
  - โฟลเดอร์ `supabase/` (ประกอบด้วย `README.md`, `schema.sql`, `seed.sql`, `reset.sql`)

### 2.2 ปรับปรุงหน้าจอและโค้ดฝั่ง Client
1. **[src/app/houses/page.tsx](file:///workspace/wise-lovelace/src/app/houses/page.tsx):**
   - ถอด `import { supabase }` และการเช็ก session ของ Supabase
   - ตัด Supabase fallback pagination loops ออกทั้งหมด
   - โหลดข้อมูลผ่าน `/api/houses`, อัปโหลด CSV ผ่าน `/api/houses/upload`, เพิ่มเข้าคิวนำทางผ่าน `/api/navigation`, แก้ไข/ลบผ่าน `/api/houses/[id]`
   - ดาวน์โหลด CSV ผ่านข้อมูลจาก Neon API โดยตรง

2. **[src/app/navigation/page.tsx](file:///workspace/wise-lovelace/src/app/navigation/page.tsx):**
   - ถอด `import { supabase }` และการเช็ก session ของ Supabase
   - เปลี่ยนการโหลดข้อมูลทั้งหมดมาใช้ `/api/navigation`
   - ปรับการทำงานของฟังก์ชันทั้งหมด (บันทึกหมายเหตุคนขับ, ส่งสำเร็จ, รายงานปัญหา, กู้คืนกลับมาวันนี้, ลบรายการเดี่ยว/ลบทั้งหมด) ให้ทำงานผ่าน Server Route Handlers ของ Neon

3. **[src/app/scan/page.tsx](file:///workspace/wise-lovelace/src/app/scan/page.tsx):**
   - ถอด `import { supabase }`
   - ฟังก์ชัน `lookupHouse` ค้นหาผ่าน `/api/houses?id=...` หรือ `/api/houses?search=...`
   - ฟังก์ชัน `addToNavigation` เพิ่มเข้าคิวผ่าน `/api/navigation`

4. **[src/components/Navbar.tsx](file:///workspace/wise-lovelace/src/components/Navbar.tsx):**
   - ถอด `User` จาก `@supabase/supabase-js` และ `supabase.auth.onAuthStateChange`
   - แสดงสถานะคนขับ DropWay และแท็บนำทางครบถ้วน
   - ฟังก์ชัน Logout ล้างข้อมูลคนขับและนำทางไปหน้า `/login`

5. **[src/app/login/page.tsx](file:///workspace/wise-lovelace/src/app/login/page.tsx) & [src/app/register/page.tsx](file:///workspace/wise-lovelace/src/app/register/page.tsx):**
   - ถอด `supabase.auth.signInWithPassword` และ `supabase.auth.signUp`
   - เข้าสู่ระบบในฐานะคนขับรถจัดส่งได้ทันที

6. **[middleware.ts](file:///workspace/wise-lovelace/middleware.ts):**
   - นำเงื่อนไขเช็ก Supabase cookies (`sb-access-token`, `sb-refresh-token`) ออก คนขับสามารถเปิดใช้งานหน้า `/houses`, `/navigation`, `/scan` บนมือถือได้ทันทีโดยไม่ถูก Redirect ค้าง

7. **[scripts/check-project.mjs](file:///workspace/wise-lovelace/scripts/check-project.mjs):**
   - ปรับปรุงขั้นตอนที่ 3 ให้ทดสอบ Neon Database ผ่าน `node scripts/test-neon.mjs`

8. **[.env.example](file:///workspace/wise-lovelace/.env.example) & เอกสาร:**
   - ปรับปรุง [.env.example](file:///workspace/wise-lovelace/.env.example), [README.md](file:///workspace/wise-lovelace/README.md), และ [SETUP_GUIDE.md](file:///workspace/wise-lovelace/SETUP_GUIDE.md) ให้มีเฉพาะการตั้งค่า `DATABASE_URL` ของ Neon

---

## 3. การตรวจสอบความถูกต้อง (Verification)
- `node node_modules/typescript/bin/tsc --noEmit` ผ่าน 100% ไม่มีข้อผิดพลาด
- `npm run lint` ผ่าน 100% (`✔ No ESLint warnings or errors`)
- ตรวจสอบ `grep -rnwi "supabase"` ในโฟลเดอร์ `src/` ไม่พบการอ้างอิงใด ๆ หลงเหลืออยู่
- UI/UX Contracts: คงรูปแบบและ UX ตามที่ระบุใน `.ai/AI_RULES.md`
