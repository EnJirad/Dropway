-- ==============================================================================
-- DropWay - Neon Serverless PostgreSQL Database Schema & Seed Data
-- ==============================================================================
-- วิธีใช้งาน:
-- 1. เข้าไปที่ Neon Console (https://console.neon.tech)
-- 2. เลือกโปรเจกต์ของคุณ -> เมนู "SQL Editor" ด้านซ้าย
-- 3. คัดลอกคำสั่งทั้งหมดในไฟล์นี้ไปวาง แล้วกด "Run"
-- ==============================================================================

-- 1. สร้างตาราง houses (คลังบ้านและข้อมูลพิกัด)
CREATE TABLE IF NOT EXISTS public.houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT,
    phone TEXT,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    note TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. สร้างตาราง user_navigation_houses (รายการนำทางและสถานะส่งของ)
CREATE TABLE IF NOT EXISTS public.user_navigation_houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default-user',
    house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
    nav_note TEXT,
    nav_priority INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    delivery_note TEXT,
    delivered_at TIMESTAMPTZ,
    report_reason TEXT,
    reported_at TIMESTAMPTZ,
    driver_note TEXT,
    call_count INTEGER NOT NULL DEFAULT 0,
    call_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_delivery_status CHECK (delivery_status IN ('pending', 'delivered', 'reported'))
);

ALTER TABLE public.user_navigation_houses ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- จุดนำทางที่ไม่มีบ้านถาวร: house_id เป็น NULL ได้ และเก็บปลายทางของวันนั้นไว้ที่ dest_*
ALTER TABLE public.user_navigation_houses ALTER COLUMN house_id DROP NOT NULL;
ALTER TABLE public.user_navigation_houses ADD COLUMN IF NOT EXISTS dest_name TEXT;
ALTER TABLE public.user_navigation_houses ADD COLUMN IF NOT EXISTS dest_phone TEXT;
ALTER TABLE public.user_navigation_houses ADD COLUMN IF NOT EXISTS dest_address TEXT;

-- พัสดุรายชิ้น: เลขพัสดุอยู่ที่ระดับพัสดุ ไม่อยู่ใน houses
CREATE TABLE IF NOT EXISTS public.parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nav_id UUID NOT NULL REFERENCES public.user_navigation_houses(id) ON DELETE CASCADE,
    tracking_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parcels_nav_tracking ON public.parcels (nav_id, upper(tracking_number)) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcels_tracking ON public.parcels (upper(tracking_number));
INSERT INTO public.parcels (nav_id, tracking_number, created_at)
SELECT unh.id, unh.tracking_number, unh.created_at
FROM public.user_navigation_houses unh
WHERE NOT EXISTS (SELECT 1 FROM public.parcels p WHERE p.nav_id = unh.id);

-- 3. สร้าง View navigation_view สำหรับเชื่อมข้อมูลระหว่างการนำทางและบ้าน
CREATE OR REPLACE VIEW public.navigation_view AS
SELECT
    unh.id AS nav_id,
    unh.user_id,
    unh.house_id,
    unh.nav_note,
    unh.nav_priority,
    unh.delivery_status,
    unh.delivery_note,
    unh.delivered_at,
    unh.report_reason,
    unh.reported_at,
    unh.driver_note,
    unh.call_count,
    unh.call_note,
    COALESCE(h.full_name, unh.dest_name) AS full_name,
    COALESCE(h.phone, unh.dest_phone) AS phone,
    COALESCE(h.address, unh.dest_address) AS address,
    h.lat,
    h.lng,
    h.note,
    COALESCE(h.quantity, 1) AS quantity,
    COALESCE(h.created_at, unh.created_at) AS created_at,
    COALESCE(h.updated_at, unh.updated_at) AS updated_at,
    COALESCE(
      (SELECT string_agg(p.tracking_number, ', ' ORDER BY p.created_at)
         FROM public.parcels p
         WHERE p.nav_id = unh.id AND p.tracking_number IS NOT NULL),
      unh.tracking_number
    ) AS tracking_number,
    GREATEST((SELECT count(*)::int FROM public.parcels p WHERE p.nav_id = unh.id), 1) AS parcel_count,
    (SELECT COALESCE(
              json_agg(json_build_object(
                'id', p.id,
                'tracking_number', p.tracking_number,
                'created_at', p.created_at
              ) ORDER BY p.created_at),
              '[]'::json)
       FROM public.parcels p WHERE p.nav_id = unh.id) AS parcels
FROM public.user_navigation_houses unh
LEFT JOIN public.houses h ON unh.house_id = h.id;

-- 4. Indexes เพื่อประสิทธิภาพในการค้นหาและจัดเรียงข้อมูล
CREATE INDEX IF NOT EXISTS idx_houses_phone ON public.houses(phone);
CREATE INDEX IF NOT EXISTS idx_houses_address ON public.houses(address);
CREATE INDEX IF NOT EXISTS idx_houses_created_at ON public.houses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_nav_priority ON public.user_navigation_houses(nav_priority);
CREATE INDEX IF NOT EXISTS idx_user_nav_status ON public.user_navigation_houses(delivery_status);

-- ==============================================================================
-- 5. ข้อมูลบ้านตัวอย่าง (ต.แม่ตาว อ.แม่สอด จ.ตาก ทั้งหมด 27 หลัง)
-- ==============================================================================
INSERT INTO public.houses (id, full_name, phone, address, lat, lng, note, created_at, updated_at)
VALUES
    ('f191d818-eeee-4c5b-a13f-7cf8def9920f', NULL, NULL, '1442 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67492, 98.5723, 'ฉลองนคร 3 ซ.15/4 หลังที่เกือบจะถึงหลังที่จะโผล่สามแยกอ่ะเป็นหลังกลางๆ', '2026-11-19T07:04:41.008076+00:00', '2026-11-19T07:04:41.008076+00:00'),
    ('a0343f80-3278-48a0-9e75-912a9437e7cd', 'นางสาว ศรุตา บรรพชาติ', NULL, '1262 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67519, 98.57225, 'ฉลองนคร 3 ซ.15/5 หลังที่ 4 ซ้ายมือ ตรงทางโค้ง', '2026-11-19T02:29:34.586693+00:00', '2026-11-19T02:29:34.586693+00:00'),
    ('99ec6253-4af5-4948-9472-12fb151d6463', 'nyein ShinPyi', NULL, '749 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66377, 98.58105, 'ผาทอง ซ.5 วนกลับ อยู่ทางขวามือ บ้านตรงหน้าโค้ง', '2026-11-19T02:23:56.755177+00:00', '2026-11-19T02:23:56.755177+00:00'),
    ('ccac7578-bedc-40da-bce6-75220ad3cc87', 'ชนัญญา', NULL, '1416 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66588, 98.58056, 'ผาทอง ซ.4 ห้องแถว ตรงโค้ง หลัง TK', '2026-11-19T02:22:52.887806+00:00', '2026-11-19T02:22:52.887806+00:00'),
    ('a432bd16-b1dc-47da-8262-05e224afc6e8', 'Rich man', NULL, '1416 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66588, 98.58056, 'ผาทอง ซ.4 ห้องแถว ตรงโค้ง หลัง TK', '2026-11-19T02:22:38.107754+00:00', '2026-11-19T02:22:38.107754+00:00'),
    ('6fdf2be6-43cf-4d4c-ac9a-bed89376b8e2', 'Naw Bah Blut Moo', NULL, '905 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67059, 98.59243, 'ไพร์วิลเลจ ซ.2 ขวา บ้านหลังที่ 2 ทางขวามือ', '2026-11-19T02:15:46.148384+00:00', '2026-11-19T02:15:46.148384+00:00'),
    ('dcdc37fe-a056-40db-8c90-1cb3ae183057', 'ญาณิศา', NULL, '974 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66967, 98.59345, 'ทุ่งเศรษฐี ซ.2 บ้านหลังที่ 3 ทางซ้ายมือ', '2026-11-19T02:14:39.588977+00:00', '2026-11-19T02:14:39.588977+00:00'),
    ('3d4b97cd-68de-4a5e-b048-155445ff6035', 'คำมา', NULL, '407 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66887, 98.58071, 'ผาทอง ซ.4 หลังที่ อยู่ ทางขวามือ ตรงข้ามบ้าน 25', '2026-11-19T02:13:58.358081+00:00', '2026-11-19T02:13:58.358081+00:00'),
    ('8dc692e0-8db8-437c-b610-6ddbdc6e9020', 'Win Win', NULL, '759 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66459, 98.57862, 'ผาทอง ซ.5 โค้งแล้ว อยู่ทางขวามือ', '2026-11-19T02:08:16.997934+00:00', '2026-11-19T02:08:16.997934+00:00'),
    ('b2cb6596-64dd-41ef-bc16-d3d7a37e31d0', 'LIN XZ8888', NULL, '917 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67111, 98.59139, 'ไพร์วิลเลจ ซ.2 ซ้าย บ้านหลังที่ 2 ทางซ้ายมือ', '2026-11-19T02:07:24.6339+00:00', '2026-11-19T02:07:24.6339+00:00'),
    ('f156c55f-9058-4971-a098-b273a949cacb', 'ตุ๊บป่อง ploy', NULL, '977 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66988, 98.59351, 'ทุ่งเศรษฐี ซ.2 บ้านหลังที่ 5 ทางซ้ายมือ', '2026-11-19T02:05:11.753452+00:00', '2026-11-19T02:05:11.753452+00:00'),
    ('3ea02c1b-779a-4ff7-a2bd-d4a2be2a4590', 'เบญจมาศ กมลกิตติกานนฑ์', NULL, '628 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.6621, 98.58008, 'ผาทอง ซ.1 โค้งขวา อยู่ทางขวามือ', '2026-11-18T02:59:41.297091+00:00', '2026-11-18T02:59:41.297091+00:00'),
    ('3dc1fbc9-008d-4014-81a9-258940efc64a', 'เม็ดทราย', NULL, '843 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67582, 98.57186, 'ฉลองนคร 2 ซ.ตรง บ้านที่ 5 ซ้ายมือ เลยซอย 7', '2026-11-18T02:55:15.593107+00:00', '2026-11-18T02:55:15.593107+00:00'),
    ('36695655-a3ad-4b48-bd05-efc7f0429d46', 'คุณเดียร์', NULL, '910 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67142, 98.59282, 'ไพร์วิลเลจ ซ.2 ขวา เข้าโค้งมา บ้านหลังที่ 5 ทางขวามือ', '2026-11-18T02:49:32.594562+00:00', '2026-11-18T02:49:32.594562+00:00'),
    ('2b651550-6349-4eac-a633-99199642b505', 'Zarchimin', NULL, '715 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.65499, 98.58299, 'ผาทอง ซ.หลังสุสาน คอกวัวเลยคอกวัวไปอยู่ซอยที่เข้าจากทางมัสยิดเข้าไปข้างล่างสุดเลย', '2026-11-18T02:34:52.877516+00:00', '2026-11-18T02:34:52.877516+00:00'),
    ('6f42e940-3f64-4403-99c0-753fa324251b', 'user3877947784625', NULL, '561 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66353, 98.5865, 'หน้าเมาน์เท่นวิวล์ ซ.3 บ้านหลังที่ 4 ซ้าย', '2026-11-18T02:21:02.510021+00:00', '2026-11-18T02:21:02.510021+00:00'),
    ('eb251dda-0c67-4226-9713-46157bfa520b', 'Hein Ko Ko Kyaw', NULL, '942 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66405, 98.58153, 'ผาทอง ซ.1 อยู่ทางซ้ายมือ', '2026-11-18T02:12:40.726814+00:00', '2026-11-18T02:12:40.726814+00:00'),
    ('e18ee451-a86d-4273-bf2c-a08da30683a8', 'เตย', NULL, '13/6 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66493, 98.58173, 'ผาทอง ซ.1 เป็นร้านขายส้มตำก่อนจะถึงซอย 1 อยู่ทางซ้ายมือเลย', '2026-11-17T01:34:06.954887+00:00', '2026-11-17T01:34:06.954887+00:00'),
    ('004546cc-73c4-45ca-98b2-53a03c78853f', NULL, NULL, '915 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67268, 98.58328, 'ซ.หลังโรงเรียน', '2026-11-16T04:31:07.821391+00:00', '2026-11-16T04:31:07.821391+00:00'),
    ('468c7b13-83de-493c-906f-6176b32e3554', 'Anna', NULL, '1212 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67077, 98.5926, 'ไพร์วิลเลจ ซ.2 ขวา เข้าโค้งมา บ้านหลังที่ 1 ทางขวามือ', '2026-11-16T02:42:15.400605+00:00', '2026-11-16T02:42:15.400605+00:00'),
    ('98ec44bf-8cec-4fc4-8a7e-251e1b0ddb92', 'chamaiphon', NULL, '1066 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.6708, 98.59192, 'ไพร์วิลเลจ ซ.กลาง บ้านหลังที่ 3 ทางซ้ายมือ', '2026-11-16T02:36:45.118744+00:00', '2026-11-16T02:36:45.118744+00:00'),
    ('029dd1b6-78a7-4f00-9e6c-1302e724195b', 'Mar Yee', NULL, '1352 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66495, 98.58112, 'ผาทอง ซ.5 วนกลับ โค้ง อยู่ทางซ้ายมือ เป็นห้องที่ 1', '2026-11-16T02:31:56.318161+00:00', '2026-11-16T02:31:56.318161+00:00'),
    ('ec7c54b0-24ec-4d4c-9a38-96c8f0a53f5f', 'นาย สมชาย วันดี', NULL, '842 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.67085, 98.59147, 'ไพร์วิลเลจ ซ.1 ซ้าย เข้าโค้งมา บ้านหลังที่ 2 ทางซ้ายมือ', '2026-11-16T01:51:49.587625+00:00', '2026-11-16T01:51:49.587625+00:00'),
    ('56e88b68-aaad-454d-84f8-c68268934fa1', 'นิตยา จาเร', NULL, '590 | 347 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66854, 98.58078, 'ผาทอง ซ.4 อยู่ซ้ายมือ 347 คนไทย อยู่แม่ตาวใหม่', '2026-11-16T01:29:17.531955+00:00', '2026-11-16T01:29:17.531955+00:00'),
    ('ee4c67d0-c0b5-4473-990f-310019630a61', 'ศักดิ์สิทธิ์ จักร์เพ็ญ', NULL, '960 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66177, 98.57757, 'ผาทอง ซ.9 อยู่ทางขวามือ บ้านตรงหัวมุมโค้ง', '2026-11-14T03:28:01.122402+00:00', '2026-11-14T03:28:01.122402+00:00'),
    ('4063ce23-a48f-4ccd-825f-d1f6b7c4e375', 'ภวัต คงประเสริฐ', NULL, '888/94 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66455, 98.58846, 'เมาน์เท่นวิวล์ ซ.4 บ้านหลังที่ 4 ขวา คนนี้มันจะลงบ้านเลขที่เป็นหมู่ 1 อ่ะ', '2026-11-14T02:58:48.356205+00:00', '2026-11-14T07:54:27.40375+00:00'),
    ('e0651891-0ecb-4be8-ab20-d28d31bc0fea', 'พัชรินทร์ ดีแก้ว เนเน่', NULL, '550 ม.3 บ.แม่ตาวแพะ ต.แม่ตาว อ.แม่สอด จ.ตาก', 16.66219, 98.57866, 'ผาทอง ซ.8 อยู่ทางซ้ายมือ', '2026-11-14T02:52:26.467084+00:00', '2026-11-14T02:52:26.467084+00:00')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ตารางเก็บค่าตั้งค่า AI ของผู้ใช้ (key เข้ารหัสด้วย AI_KEYS_SECRET)
-- ค่า key ถูกเข้ารหัส AES-256-GCM ฝั่งเซิร์ฟเวอร์ก่อนเขียนลงตารางนี้
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_settings (
  user_id TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_key_enc TEXT,
  backup_key_enc TEXT,
  api_key_hint TEXT,
  backup_key_hint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
