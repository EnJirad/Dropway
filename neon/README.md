# 🐘 Neon PostgreSQL Database Guide — DropWay

หน้านี้อธิบายวิธีใช้งานและตั้งค่า **Neon Serverless PostgreSQL** ร่วมกับโปรเจกต์ DropWay

---

## 🌟 จุดเด่นเมื่อใช้ Neon กับ DropWay

1. **Auto-Create Tables อัตโนมัติ:** เมื่อคุณอัปโหลดไฟล์ CSV บนหน้าเว็บ DropWay ระบบจะตรวจสอบและ **สร้างตาราง `houses`, `user_navigation_houses` และวิว `navigation_view` ให้อัตโนมัติทันที** โดยที่คุณไม่ต้องเข้า SQL Editor ก่อน!
2. **Serverless Scaling:** ฐานข้อมูล Neon จะเปิด-ปิดการทำงานตามการใช้งานจริง ไม่เปลืองทรัพยากร
3. **รองรับ CSV ครบถ้วน:** รองรับการอัปโหลด CSV รูปแบบที่อยู่ไทย (เช่น แม่สอด จ.ตาก) พร้อมพิกัด GPS ละติจูด/ลองจิจูด

---

## 🚀 วิธีตั้งค่า Neon Database (3 ขั้นตอน)

### ขั้นตอนที่ 1: สร้างโปรเจกต์บน Neon
1. ไปที่ [console.neon.tech](https://console.neon.tech)
2. กดปุ่ม **"Create Project"** ตั้งชื่อ เช่น `dropway`
3. เลือก Region ที่ใกล้ที่สุด เช่น `Singapore (ap-southeast-1)`

### ขั้นตอนที่ 2: คัดลอก Connection String
1. ในหน้า Dashboard ของ Neon จะมีกล่อง **Connection Details**
2. เลือกแท็บ **Pooled connection** (หรือ Direct)
3. คัดลอก Connection String ที่ขึ้นต้นด้วย `postgresql://...`
4. นำมาใส่ในไฟล์ `.env.local` ในโปรเจกต์ของคุณ:
   ```env
   DATABASE_URL=postgresql://neondb_owner:your_password@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### ขั้นตอนที่ 3: ทดสอบการเชื่อมต่อ
เปิด Terminal ในโปรเจกต์แล้วรัน:
```bash
npm run test:neon
```
เมื่อเชื่อมต่อสำเร็จ ระบบจะรายงานสถานะสีเขียว `✓` พร้อมใช้งานทันที!

---

## 📥 การนำเข้าข้อมูล CSV

เมื่อเปิดหน้าเว็บ DropWay (`http://localhost:3000/houses`):
1. กดปุ่ม **"อัพโหลด CSV"**
2. เลือกไฟล์ CSV ของคุณ (เช่น [`data/sample-houses.csv`](../data/sample-houses.csv))
3. ระบบจะ:
   - ตรวจสอบว่ามีตารางใน Neon หรือยัง หากยังไม่มีจะสร้างให้อัตโนมัติ
   - ตรวจสอบ ID ซ้ำ
   - บันทึกข้อมูลและแสดงผลบนหน้าจอทันที!

---

## 🛠️ โครงสร้างไฟล์ในโฟลเดอร์นี้
- `neon/schema.sql`: โค้ด SQL เต็มรูปแบบ พร้อมข้อมูลตัวอย่างบ้าน 27 หลังใน ต.แม่ตาว อ.แม่สอด จ.ตาก สำหรับกรณีที่ต้องการรันเองบน Neon SQL Editor
