/**
 * Secret ระดับแอปที่สร้างและเก็บในฐานข้อมูลอัตโนมัติ
 *
 * ใช้กับกรณีที่ยังไม่ได้ตั้ง env (เช่น AI_KEYS_SECRET):
 * - สร้างค่าสุ่ม 32 ไบต์ครั้งแรก แล้วเก็บในตาราง public.app_secrets
 * - ครั้งต่อไปอ่านค่าเดิมกลับมาใช้ (แคชในหน่วยความจำของเซิร์ฟเวอร์)
 *
 * ข้อแลกเปลี่ยนด้านความปลอดภัย: ค่า secret อยู่ในฐานข้อมูลเดียวกับข้อมูลที่ถูกเข้ารหัส
 * จึงกันการอ่านข้อมูลจากภายนอก/ไฟล์ build ได้ แต่ถ้าฐานข้อมูลถูกเจาะทั้งก้อนก็ถอดได้
 * production ควรตั้ง env AI_KEYS_SECRET เอง (โค้ดจะใช้ env ก่อนเสมอ)
 */

import { randomBytes } from "node:crypto";
import { getDb, isNeonConfigured } from "@/lib/db";

const cache = new Map<string, string>();
let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS public.app_secrets (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  tableReady = true;
}

/** อ่าน secret ตามชื่อ ถ้ายังไม่มีจะสร้างให้อัตโนมัติ (คืน null เมื่อไม่มีฐานข้อมูล) */
export async function getOrCreateAppSecret(name: string, bytes = 32): Promise<string | null> {
  const cached = cache.get(name);
  if (cached) return cached;
  if (!isNeonConfigured) return null;

  await ensureTable();
  const sql = getDb();

  const existing = (await sql`
    SELECT value FROM public.app_secrets WHERE name = ${name} LIMIT 1
  `) as { value: string }[];
  if (existing[0]?.value) {
    cache.set(name, existing[0].value);
    return existing[0].value;
  }

  const value = randomBytes(bytes).toString("base64");
  await sql`
    INSERT INTO public.app_secrets (name, value)
    VALUES (${name}, ${value})
    ON CONFLICT (name) DO NOTHING;
  `;

  // อ่านซ้ำเพื่อกันกรณีมีคำขออื่นสร้างพร้อมกันแล้วเราชน constraint
  const again = (await sql`
    SELECT value FROM public.app_secrets WHERE name = ${name} LIMIT 1
  `) as { value: string }[];
  const resolved = again[0]?.value ?? null;
  if (resolved) cache.set(name, resolved);
  return resolved;
}
