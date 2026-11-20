import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/houses - ดึงรายการบ้านทั้งหมด
export async function GET(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json(
        { error: "Neon Database is not configured", isConfigured: false, data: [] },
        { status: 200 }
      );
    }

    await ensureDatabaseSchema();
    const sql = getDb();

    const id = request.nextUrl.searchParams.get("id")?.trim();
    const search = request.nextUrl.searchParams.get("search")?.trim();
    let houses;

    if (id) {
      houses = await sql`
        SELECT * FROM public.houses
        WHERE id = ${id}
        LIMIT 1;
      `;
    } else if (search) {
      const term = `%${search}%`;
      houses = await sql`
        SELECT * FROM public.houses
        WHERE full_name ILIKE ${term}
           OR phone ILIKE ${term}
           OR address ILIKE ${term}
           OR note ILIKE ${term}
        ORDER BY created_at DESC
        LIMIT 5000;
      `;
    } else {
      houses = await sql`
        SELECT * FROM public.houses
        ORDER BY created_at DESC
        LIMIT 5000;
      `;
    }

    return NextResponse.json({ data: houses, count: houses.length });
  } catch (error) {
    console.error("API /api/houses GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database error", data: [] },
      { status: 500 }
    );
  }
}

// POST /api/houses - สร้างบ้านใหม่ 1 หลัง
export async function POST(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json(
        { error: "ยังไม่ได้ระบุ DATABASE_URL สำหรับ Neon" },
        { status: 400 }
      );
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const body = await request.json();

    const id = body.id || crypto.randomUUID();
    const fullName = body.full_name || null;
    const phone = body.phone || null;
    const address = body.address || null;
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const note = body.note || null;
    const quantity = body.quantity != null ? Number(body.quantity) : 1;

    const result = await sql`
      INSERT INTO public.houses (
        id, full_name, phone, address, lat, lng, note, quantity, created_at, updated_at
      ) VALUES (
        ${id}, ${fullName}, ${phone}, ${address}, ${lat}, ${lng}, ${note}, ${quantity}, now(), now()
      )
      RETURNING *;
    `;

    return NextResponse.json({ data: result[0], success: true });
  } catch (error) {
    console.error("API /api/houses POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Insert failed" },
      { status: 500 }
    );
  }
}
