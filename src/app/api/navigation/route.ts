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
    const trackingNumber =
      typeof body.tracking_number === "string" && body.tracking_number.trim()
        ? body.tracking_number.trim().toUpperCase()
        : null;

    if (!houseId) {
      return NextResponse.json({ error: "house_id is required" }, { status: 400 });
    }
    const force = body.force === true;
    // as_parcel: หน้าสแกนเพิ่มพัสดุอีกชิ้น (แม้ไม่มีเลขพัสดุ); ที่อื่นเรียกซ้ำจะไม่เพิ่มพัสดุซ้ำ
    const asParcel = body.as_parcel === true || trackingNumber !== null;

    // จุดนำทางเดิมของบ้านนี้ (ที่ยังไม่ส่งแล้ว) → ใช้จุดเดิม ไม่สร้างจุดซ้ำ
    const existingRows = await sql`
      SELECT id FROM public.user_navigation_houses
      WHERE house_id = ${houseId} AND user_id = ${userId} AND delivery_status <> 'delivered'
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const existingId: string | null = existingRows[0]?.id ? String(existingRows[0].id) : null;

    if (trackingNumber) {
      const dup = await sql`
        SELECT nav_id FROM public.parcels
        WHERE upper(tracking_number) = ${trackingNumber}
          AND (
            nav_id = ${existingId}
            OR (created_at AT TIME ZONE 'Asia/Bangkok')::date = (now() AT TIME ZONE 'Asia/Bangkok')::date
          );
      `;
      if (existingId && dup.some((d) => String(d.nav_id) === existingId)) {
        return NextResponse.json(
          { error: "บ้านนี้มีพัสดุเลขนี้ในคิวแล้ว", duplicate: true, same_stop: true },
          { status: 409 }
        );
      }
      if (dup.length > 0 && !force) {
        return NextResponse.json(
          { error: "เลขพัสดุนี้ถูกบันทึกวันนี้แล้ว", duplicate: true, same_stop: false },
          { status: 409 }
        );
      }
    }

    let navId = existingId;
    const created = !existingId;
    if (!navId) {
      const inserted = await sql`
        INSERT INTO public.user_navigation_houses (
          user_id, house_id, nav_note, nav_priority, delivery_status
        ) VALUES (
          ${userId}, ${houseId}, ${navNote}, ${navPriority}, 'pending'
        )
        RETURNING id;
      `;
      navId = String(inserted[0].id);
    }

    if (created || asParcel) {
      await sql`
        INSERT INTO public.parcels (nav_id, tracking_number)
        VALUES (${navId}, ${trackingNumber});
      `;
    }

    const countRows = await sql`
      SELECT count(*)::int AS n FROM public.parcels WHERE nav_id = ${navId};
    `;

    return NextResponse.json({
      data: { id: navId, house_id: houseId },
      nav_id: navId,
      parcel_count: countRows[0]?.n ?? 1,
      added_to_existing: !created,
      success: true,
    });
  } catch (error) {
    console.error("API /api/navigation POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Add to navigation failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/navigation - ลบรายการนำทางทั้งหมด หรือตามรายชื่อ id
export async function DELETE(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json({ error: "Neon not configured" }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length > 0) {
      await sql`
        DELETE FROM public.user_navigation_houses
        WHERE id = ANY(${ids});
      `;
    } else {
      await sql`
        DELETE FROM public.user_navigation_houses;
      `;
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("API /api/navigation DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete navigation failed" },
      { status: 500 }
    );
  }
}
