-- ==============================================================================
-- DropWay - Database Reset Script (ลบตารางทั้งหมดเพื่อสร้างใหม่)
-- ==============================================================================
-- คำเตือน: สคริปต์นี้จะลบข้อมูลทั้งหมดในตาราง houses และ user_navigation_houses
-- กรุณาสำรองข้อมูลก่อนรันหากมีข้อมูลจริงที่สำคัญ
-- ==============================================================================

-- 1. ลบ Views
DROP VIEW IF EXISTS public.navigation_view CASCADE;

-- 2. ลบ Triggers
DROP TRIGGER IF EXISTS trigger_houses_updated_at ON public.houses;
DROP TRIGGER IF EXISTS trigger_user_nav_updated_at ON public.user_navigation_houses;

-- 3. ลบ Tables
DROP TABLE IF EXISTS public.user_navigation_houses CASCADE;
DROP TABLE IF EXISTS public.houses CASCADE;

-- 4. ลบ Functions
DROP FUNCTION IF EXISTS public.handle_updated_at();

-- ข้อความยืนยัน
SELECT 'ฐานข้อมูลถูกรีเซ็ตเรียบร้อยแล้ว สามารถรัน schema.sql เพื่อสร้างใหม่ได้ทันที' AS status;
