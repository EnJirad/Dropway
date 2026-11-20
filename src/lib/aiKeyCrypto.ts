/**
 * เข้ารหัส API key ก่อนเก็บลงฐานข้อมูล (AES-256-GCM)
 *
 * ลำดับการได้มาซึ่งคีย์เข้ารหัส:
 * 1) env AI_KEYS_SECRET (แนะนำสำหรับ production) — hex 64 ตัว / base64 32 ไบต์ / ข้อความยาว ๆ
 * 2) ถ้าไม่มี env → สร้าง secret สุ่มเก็บในตาราง public.app_secrets ให้อัตโนมัติ
 *    (ทำงานได้ทันทีโดยไม่ต้องตั้งค่าเพิ่ม แต่ถ้าฐานข้อมูลถูกเจาะทั้งก้อนก็ถอดได้)
 * 3) ถ้าไม่มีทั้ง env และฐานข้อมูล → คืน null และระบบจะไม่ยอมเก็บ key (ไม่มีการเก็บ plaintext)
 *
 * ค่าที่เก็บในฐานข้อมูลมีรูปแบบ v1.<iv>.<tag>.<ciphertext> (base64url)
 * ไฟล์นี้ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getOrCreateAppSecret } from "@/lib/appSecret";

const ALGO = "aes-256-gcm";
const VERSION = "v1";
const SALT = "dropway-ai-keys-v1";
const DB_SECRET_NAME = "ai_keys_secret";

let cachedKey: Buffer | null = null;
let resolving: Promise<Buffer | null> | null = null;

function derive(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // ไม่ใช่ base64 — ไป derive ต่อ
  }
  return scryptSync(raw, SALT, 32);
}

/**
 * คีย์สำหรับเข้ารหัส: env ก่อน ถ้าไม่มีก็สร้างในฐานข้อมูลอัตโนมัติ
 * คืน null เมื่อยังไม่มีทั้ง env และฐานข้อมูล (ผู้เรียกต้องแจ้งผู้ใช้)
 */
export async function getEncryptionKey(): Promise<Buffer | null> {
  const env = (process.env.AI_KEYS_SECRET ?? "").trim();
  if (env) return derive(env);

  if (cachedKey) return cachedKey;
  if (resolving) return resolving;

  resolving = (async () => {
    try {
      const secret = await getOrCreateAppSecret(DB_SECRET_NAME);
      if (!secret) return null;
      const key = derive(secret);
      cachedKey = key;
      return key;
    } catch {
      return null;
    }
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

/** ตั้งค่า secret ไว้หรือยัง (env หรือฐานข้อมูล) — ใช้บอกผู้ใช้ในหน้าตั้งค่า */
export async function isKeyEncryptionReady(): Promise<boolean> {
  return (await getEncryptionKey()) !== null;
}

export async function encryptSecret(plain: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** คืน null ถ้าถอดไม่ได้ (secret เปลี่ยน/ข้อมูลเสีย) — ไม่ throw ให้คำขอหลักพัง */
export async function decryptSecret(payload: string | null | undefined): Promise<string | null> {
  if (!payload) return null;
  const key = await getEncryptionKey();
  if (!key) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

/** แสดงเฉพาะท้าย key ไว้ให้ผู้ใช้จำได้ว่าเป็นอันไหน (ไม่พอต่อการใช้งาน) */
export function keyHint(plain: string): string {
  const v = plain.trim();
  if (v.length < 8) return "";
  return `••••${v.slice(-4)}`;
}
