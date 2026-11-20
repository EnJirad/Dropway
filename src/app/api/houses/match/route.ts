import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";
import { extractTracking, matchHouses } from "@/lib/parcelMatch";
import type { House } from "@/types/house";

export const dynamic = "force-dynamic";

// POST /api/houses/match - เทียบข้อความจากฉลาก/บาร์โค้ดกับบ้านในคลัง
export async function POST(request: NextRequest) {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json(
        { error: "Neon Database is not configured", candidates: [] },
        { status: 200 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.slice(0, 5000) : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "ไม่มีข้อความให้เทียบ", candidates: [] }, { status: 400 });
    }

    await ensureDatabaseSchema();
    const sql = getDb();

    const tracking = extractTracking(text);

    const houses = (await sql`SELECT * FROM public.houses;`) as unknown as House[];
    const candidates = matchHouses(houses, text);

    return NextResponse.json({ candidates, tracking, count: candidates.length });
  } catch (error) {
    console.error("API /api/houses/match error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Match failed", candidates: [] },
      { status: 500 }
    );
  }
}
