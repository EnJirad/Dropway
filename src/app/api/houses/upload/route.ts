import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

interface UploadRow {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  quantity?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json(
        {
          error: "ยังไม่ได้ระบุ DATABASE_URL สำหรับ Neon ใน .env.local",
          isConfigured: false,
        },
        { status: 400 }
      );
    }

    // 1. ตรวจสอบและสร้างฐานข้อมูล/ตารางอัตโนมัติหากยังไม่มี (Auto-schema initialization)
    await ensureDatabaseSchema();

    const body = await request.json();
    const rows: UploadRow[] = Array.isArray(body) ? body : body.rows;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลที่ต้องการนำเข้า" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // 2. ตรวจสอบ id ที่มีอยู่แล้วในฐานข้อมูล (Duplicate checking)
    const allIds = rows.map((r) => r.id.toLowerCase());
    const existingIdSet = new Set<string>();

    for (let i = 0; i < allIds.length; i += 200) {
      const chunk = allIds.slice(i, i + 200);
      const existing = await sql`
        SELECT id FROM public.houses
        WHERE id::text = ANY(${chunk})
      `;
      existing.forEach((item: Record<string, unknown>) => {
        if (item.id) {
          existingIdSet.add(String(item.id).toLowerCase());
        }
      });
    }

    // 3. กรองเฉพาะแถวใหม่ที่ไม่ซ้ำ
    const newRows = rows.filter((r) => !existingIdSet.has(r.id.toLowerCase()));
    const duplicates = rows.length - newRows.length;

    if (newRows.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        duplicates,
        total: rows.length,
        message: `ไม่มีข้อมูลใหม่ — ข้ามรายการซ้ำทั้งหมด ${duplicates} รายการ`,
      });
    }

    // 4. บันทึกข้อมูลลง Neon (Batch Insert)
    let inserted = 0;
    for (const row of newRows) {
      try {
        await sql`
          INSERT INTO public.houses (
            id, full_name, phone, address, lat, lng, note, quantity, created_at, updated_at
          ) VALUES (
            ${row.id},
            ${row.full_name || null},
            ${row.phone || null},
            ${row.address || null},
            ${row.lat ?? null},
            ${row.lng ?? null},
            ${row.note || null},
            ${row.quantity ?? 1},
            ${row.created_at || new Date().toISOString()},
            ${row.updated_at || new Date().toISOString()}
          )
          ON CONFLICT (id) DO NOTHING;
        `;
        inserted += 1;
      } catch (insertErr) {
        console.error("Row insert error:", row.id, insertErr);
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      duplicates,
      total: rows.length,
      message: `นำเข้าสำเร็จ ${inserted} รายการ${duplicates > 0 ? ` (ข้ามรายการซ้ำ ${duplicates} รายการ)` : ""}`,
    });
  } catch (error) {
    console.error("API /api/houses/upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปโหลด",
      },
      { status: 500 }
    );
  }
}
