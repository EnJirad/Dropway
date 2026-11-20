-- ==============================================================================
-- DropWay - Database Schema Definition for Supabase (Root Alias)
-- ==============================================================================
-- สคริปต์นี้เป็นไฟล์เดียวกับ supabase/schema.sql วางไว้ที่ root เพื่อความสะดวก
-- ดูรายละเอียดและสคริปต์ seed / reset ได้ที่โฟลเดอร์ supabase/
-- ==============================================================================

-- 0. เปิดใช้งาน Extensions ที่จำเป็น
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ตาราง houses (คลังบ้านและข้อมูลผู้รับหลัก)
-- ==============================================================================
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

-- ==============================================================================
-- 2. ตาราง user_navigation_houses (รายการนำทางและสถานะส่งของของผู้ใช้)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_navigation_houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- ==============================================================================
-- 3. วิว navigation_view (เชื่อมโยงข้อมูลการนำทางกับรายละเอียดบ้าน)
-- ==============================================================================
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
    h.full_name,
    h.phone,
    h.address,
    h.lat,
    h.lng,
    h.note,
    h.quantity,
    h.created_at,
    h.updated_at
FROM public.user_navigation_houses unh
LEFT JOIN public.houses h ON unh.house_id = h.id;

DO $$
BEGIN
    ALTER VIEW public.navigation_view SET (security_invoker = true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 4. Indexes เพื่อประสิทธิภาพในการค้นหาและจัดเรียงข้อมูล
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_houses_phone ON public.houses(phone);
CREATE INDEX IF NOT EXISTS idx_houses_address ON public.houses(address);
CREATE INDEX IF NOT EXISTS idx_houses_created_at ON public.houses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_houses_coords ON public.houses(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_nav_user_id ON public.user_navigation_houses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_nav_house_id ON public.user_navigation_houses(house_id);
CREATE INDEX IF NOT EXISTS idx_user_nav_priority ON public.user_navigation_houses(user_id, nav_priority ASC);
CREATE INDEX IF NOT EXISTS idx_user_nav_status ON public.user_navigation_houses(user_id, delivery_status);

-- ==============================================================================
-- 5. Trigger สำหรับอัปเดตฟิลด์ updated_at อัตโนมัติ
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_houses_updated_at ON public.houses;
CREATE TRIGGER trigger_houses_updated_at
    BEFORE UPDATE ON public.houses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_user_nav_updated_at ON public.user_navigation_houses;
CREATE TRIGGER trigger_user_nav_updated_at
    BEFORE UPDATE ON public.user_navigation_houses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 6. Row Level Security (RLS) เพื่อความปลอดภัยของข้อมูล
-- ==============================================================================
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_navigation_houses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read houses" ON public.houses;
DROP POLICY IF EXISTS "Allow authenticated users to insert houses" ON public.houses;
DROP POLICY IF EXISTS "Allow authenticated users to update houses" ON public.houses;
DROP POLICY IF EXISTS "Allow authenticated users to delete houses" ON public.houses;

DROP POLICY IF EXISTS "Users can manage their own navigation houses" ON public.user_navigation_houses;

CREATE POLICY "Allow authenticated users to read houses"
    ON public.houses FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert houses"
    ON public.houses FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update houses"
    ON public.houses FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete houses"
    ON public.houses FOR DELETE
    TO authenticated
    USING (true);

CREATE POLICY "Users can manage their own navigation houses"
    ON public.user_navigation_houses FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
