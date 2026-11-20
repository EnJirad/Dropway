import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureDatabaseSchema, isNeonConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 500;

interface UploadRow {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  note?: string | null;
  quantity?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface PreparedRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  quantity: number;
  created_at: string | null;
  updated_at: string | null;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown): string | null {
  const s = text(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

    await ensureDatabaseSchema();

    const body = await request.json();
    const rows: UploadRow[] = Array.isArray(body) ? body : body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลที่ต้องการนำเข้า" }, { status: 400 });
    }

    // เตรียมแถว: รับทุกแถวที่มีข้อมูลอย่างน้อย 1 อย่าง, ไม่มี id ที่ถูกต้องให้สร้างใหม่
    const prepared: PreparedRow[] = [];
    let skippedEmpty = 0;
    for (const r of rows) {
      if (!r || typeof r !== "object") {
        skippedEmpty += 1;
        continue;
      }
      const full_name = text(r.full_name);
      const phone = text(r.phone);
      const address = text(r.address);
      const note = text(r.note);
      const lat = num(r.lat);
      const lng = num(r.lng);
      if (!full_name && !phone && !address && !note && lat == null && lng == null) {
        skippedEmpty += 1;
        continue;
      }
      const rawId = text(r.id);
      const q = num(r.quantity);
      prepared.push({
        id: rawId && UUID_RE.test(rawId) ? rawId.toLowerCase() : crypto.randomUUID(),
        full_name,
        phone,
        address,
        lat,
        lng,
        note,
        quantity: q != null && q >= 1 ? Math.floor(q) : 1,
        created_at: isoDate(r.created_at),
        updated_at: isoDate(r.updated_at),
      });
    }

    const sql = getDb();

    // เพิ่มทีละ 500 แถวใน 1 query (เดิมเพิ่มทีละแถว ทำให้หมดเวลาเมื่อไฟล์ใหญ่)
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const c = prepared.slice(i, i + CHUNK);
      try {
        const res = await sql`
          INSERT INTO public.houses (
            id, full_name, phone, address, lat, lng, note, quantity, created_at, updated_at
          )
          SELECT
            t.id, t.full_name, t.phone, t.address, t.lat, t.lng, t.note,
            COALESCE(t.quantity, 1), COALESCE(t.created_at, now()), COALESCE(t.updated_at, now())
          FROM unnest(
            ${c.map((r) => r.id)}::uuid[],
            ${c.map((r) => r.full_name)}::text[],
            ${c.map((r) => r.phone)}::text[],
            ${c.map((r) => r.address)}::text[],
            ${c.map((r) => r.lat)}::float8[],
            ${c.map((r) => r.lng)}::float8[],
            ${c.map((r) => r.note)}::text[],
            ${c.map((r) => r.quantity)}::int[],
            ${c.map((r) => r.created_at)}::timestamptz[],
            ${c.map((r) => r.updated_at)}::timestamptz[]
          ) AS t(id, full_name, phone, address, lat, lng, note, quantity, created_at, updated_at)
          ON CONFLICT (id) DO NOTHING
          RETURNING id;
        `;
        inserted += res.length;
      } catch (chunkErr) {
        failed += c.length;
        console.error("Chunk insert error:", i, chunkErr);
      }
    }

    const duplicates = prepared.length - inserted - failed;
    const extra: string[] = [];
    if (duplicates > 0) extra.push(`ข้ามรายการซ้ำ ${duplicates}`);
    if (skippedEmpty > 0) extra.push(`ข้ามแถวว่าง ${skippedEmpty}`);
    if (failed > 0) extra.push(`ล้มเหลว ${failed}`);

    return NextResponse.json({
      success: true,
      inserted,
      duplicates,
      skippedEmpty,
      failed,
      total: rows.length,
      message: `นำเข้าสำเร็จ ${inserted} รายการ${extra.length ? ` (${extra.join(", ")})` : ""}`,
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
