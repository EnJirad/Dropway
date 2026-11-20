import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// PUT /api/houses/[id] - แก้ไขข้อมูลบ้าน
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
    const houseId = params.id;
    const body = await request.json();

    const fullName = body.full_name !== undefined ? body.full_name : null;
    const phone = body.phone !== undefined ? body.phone : null;
    const address = body.address !== undefined ? body.address : null;
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const note = body.note !== undefined ? body.note : null;
    const quantity = body.quantity != null ? Number(body.quantity) : 1;

    const result = await sql`
      UPDATE public.houses
      SET full_name = ${fullName},
          phone = ${phone},
          address = ${address},
          lat = ${lat},
          lng = ${lng},
          note = ${note},
          quantity = ${quantity},
          updated_at = now()
      WHERE id = ${houseId}
      RETURNING *;
    `;

    return NextResponse.json({ data: result[0], success: true });
  } catch (error) {
    console.error("API /api/houses/[id] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/houses/[id] - ลบบ้าน
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
    const houseId = params.id;

    await sql`
      DELETE FROM public.houses
      WHERE id = ${houseId};
    `;

    return NextResponse.json({ success: true, id: houseId });
  } catch (error) {
    console.error("API /api/houses/[id] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
