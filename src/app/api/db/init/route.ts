import { NextResponse } from "next/server";
import { ensureDatabaseSchema, isNeonConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/db/init - สั่งให้ระบบสร้างตารางทันที (Idempotent)
export async function POST() {
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

    await ensureDatabaseSchema();
    const sql = getDb();
    const [{ count }] = await sql`SELECT count(*)::int as count FROM public.houses`;

    return NextResponse.json({
      success: true,
      message: "สร้างโครงสร้างตารางบน Neon สำเร็จเรียบร้อย",
      housesCount: count,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Init schema failed",
      },
      { status: 500 }
    );
  }
}

// GET /api/db/test - ตรวจสอบการเชื่อมต่อ Neon
export async function GET() {
  try {
    if (!isNeonConfigured) {
      return NextResponse.json(
        {
          connected: false,
          message: "ยังไม่ได้ระบุ DATABASE_URL สำหรับ Neon ใน .env.local",
        },
        { status: 200 }
      );
    }

    const sql = getDb();
    const result = await sql`SELECT 1 as connected, current_database() as db, version() as version`;

    return NextResponse.json({
      connected: true,
      database: result[0]?.db,
      version: result[0]?.version,
      message: "เชื่อมต่อกับ Neon Database สำเร็จสมบูรณ์",
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 500 }
    );
  }
}
