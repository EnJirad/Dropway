import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon Serverless PostgreSQL Database Helper
 * รองรับการเชื่อมต่อฐานข้อมูล Neon และสร้างตารางให้อัตโนมัติ (Auto-schema initialization)
 */

const connectionString =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.NEON_DATABASE_URL?.trim();

export const isNeonConfigured = Boolean(
  connectionString &&
    connectionString.startsWith("postgres") &&
    !connectionString.includes("your-neon-database-url")
);

let cachedSql: NeonQueryFunction<false, false> | null = null;

export function getDb() {
  if (!isNeonConfigured || !connectionString) {
    throw new Error(
      "ยังไม่ได้ระบุ DATABASE_URL สำหรับ Neon ใน .env.local กรุณาตั้งค่าเพื่อใช้งาน"
    );
  }

  if (!cachedSql) {
    cachedSql = neon(connectionString);
  }
  return cachedSql;
}

/**
 * สคริปต์สร้างตารางอัตโนมัติหากยังไม่มีในฐานข้อมูล (Auto-init Schema)
 * จะถูกเรียกใช้อัตโนมัติเมื่อมีการอัปโหลด CSV หรือเรียกใช้ API
 */
let isSchemaInitialized = false;

export async function ensureDatabaseSchema(): Promise<void> {
  if (isSchemaInitialized || !isNeonConfigured) return;

  const sql = getDb();

  try {
    // 1. ตาราง houses
    await sql`
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
    `;

    // 2. ตาราง user_navigation_houses
    await sql`
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );
    `;

    // 2.1 เลขพัสดุ (เพิ่มภายหลัง จึงใช้ ALTER เพื่อรองรับฐานข้อมูลเดิม)
    await sql`ALTER TABLE public.user_navigation_houses ADD COLUMN IF NOT EXISTS tracking_number TEXT;`;

    // 2.2 พัสดุรายชิ้น: จุดนำทางหนึ่งจุดมีได้หลายพัสดุ เลขพัสดุเก็บที่ระดับพัสดุ ไม่เก็บใน houses
    await sql`
      CREATE TABLE IF NOT EXISTS public.parcels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nav_id UUID NOT NULL REFERENCES public.user_navigation_houses(id) ON DELETE CASCADE,
        tracking_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;
    // เลขพัสดุซ้ำได้ข้ามจุดนำทาง/ข้ามวัน แต่ห้ามซ้ำภายในจุดเดียวกัน (กันกดเพิ่มซ้ำ)
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_parcels_nav_tracking ON public.parcels (nav_id, upper(tracking_number)) WHERE tracking_number IS NOT NULL;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_parcels_tracking ON public.parcels (upper(tracking_number));`;
    // ย้ายข้อมูลเดิม (เพิ่มอย่างเดียว ไม่ลบ/ไม่แก้แถวเดิม): แถวนำทางที่ยังไม่มีพัสดุ = 1 พัสดุ
    await sql`
      INSERT INTO public.parcels (nav_id, tracking_number, created_at)
      SELECT unh.id, unh.tracking_number, unh.created_at
      FROM public.user_navigation_houses unh
      WHERE NOT EXISTS (SELECT 1 FROM public.parcels p WHERE p.nav_id = unh.id);
    `;

    // 3. วิว navigation_view
    await sql`
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
        h.updated_at,
        COALESCE(
          (SELECT string_agg(p.tracking_number, ', ' ORDER BY p.created_at)
             FROM public.parcels p
             WHERE p.nav_id = unh.id AND p.tracking_number IS NOT NULL),
          unh.tracking_number
        ) AS tracking_number,
        GREATEST(
          (SELECT count(*)::int FROM public.parcels p WHERE p.nav_id = unh.id),
          1
        ) AS parcel_count,
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
    `;

    // 4. Indexes เพื่อความรวดเร็ว
    await sql`CREATE INDEX IF NOT EXISTS idx_houses_phone ON public.houses(phone);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_houses_address ON public.houses(address);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_houses_created_at ON public.houses(created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_nav_priority ON public.user_navigation_houses(nav_priority);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_nav_status ON public.user_navigation_houses(delivery_status);`;

    isSchemaInitialized = true;
    console.log("[DropWay Database] ตรวจสอบและสร้างโครงสร้างตาราง Neon อัตโนมัติสำเร็จ");
  } catch (err) {
    console.error("[DropWay Database] เกิดข้อผิดพลาดในการสร้างโครงสร้างตาราง:", err);
    throw err;
  }
}
