import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// PUT /api/navigation/[id] - อัปเดตสถานะการนำทาง (ส่งสำเร็จ, ย้อนกลับวันนี้, รายงานปัญหา)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json({ error: "Neon not configured" }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const navId = params.id;
    const body = await request.json();

    const deliveryStatus = body.delivery_status;
    const deliveryNote = body.delivery_note !== undefined ? body.delivery_note : null;
    const deliveredAt = body.delivered_at !== undefined ? body.delivered_at : null;
    const reportReason = body.report_reason !== undefined ? body.report_reason : null;
    const reportedAt = body.reported_at !== undefined ? body.reported_at : null;
    const driverNote = body.driver_note !== undefined ? body.driver_note : null;

    const result = await sql`
      UPDATE public.user_navigation_houses
      SET
        delivery_status = COALESCE(${deliveryStatus}, delivery_status),
        delivery_note = COALESCE(${deliveryNote}, delivery_note),
        delivered_at = ${deliveredAt},
        report_reason = ${reportReason},
        reported_at = ${reportedAt},
        driver_note = COALESCE(${driverNote}, driver_note),
        updated_at = now()
      WHERE id = ${navId}
      RETURNING *;
    `;

    return NextResponse.json({ data: result[0], success: true });
  } catch (error) {
    console.error("API /api/navigation/[id] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update navigation failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/navigation/[id] - ลบรายการออกจากคิวนำทาง
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json({ error: "Neon not configured" }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();
    const navId = params.id;

    await sql`
      DELETE FROM public.user_navigation_houses
      WHERE id = ${navId};
    `;

    return NextResponse.json({ success: true, id: navId });
  } catch (error) {
    console.error("API /api/navigation/[id] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete navigation failed" },
      { status: 500 }
    );
  }
}
