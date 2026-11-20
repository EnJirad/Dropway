import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/navigation - ดึงรายการนำทางทั้งหมดจาก navigation_view
export async function GET(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json({ data: [], isConfigured: false }, { status: 200 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const userId = request.nextUrl.searchParams.get("userId") || "default-user";

    const rows = await sql`
      SELECT * FROM public.navigation_view
      WHERE user_id = ${userId} OR user_id = 'default-user'
      ORDER BY nav_priority ASC, created_at DESC;
    `;

    return NextResponse.json({ data: rows, count: rows.length });
  } catch (error) {
    console.error("API /api/navigation GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching navigation", data: [] },
      { status: 500 }
    );
  }
}

// POST /api/navigation - เพิ่มบ้านเข้าคิวนำทาง
export async function POST(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json({ error: "Neon not configured" }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const body = await request.json();

    const houseId = body.house_id;
    const userId = body.user_id || "default-user";
    const navNote = body.nav_note || null;
    const navPriority = body.nav_priority ?? 0;

    const result = await sql`
      INSERT INTO public.user_navigation_houses (
        user_id, house_id, nav_note, nav_priority, delivery_status
      ) VALUES (
        ${userId}, ${houseId}, ${navNote}, ${navPriority}, 'pending'
      )
      RETURNING *;
    `;

    return NextResponse.json({ data: result[0], success: true });
  } catch (error) {
    console.error("API /api/navigation POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Add to navigation failed" },
      { status: 500 }
    );
  }
}
