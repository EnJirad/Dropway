/**
 * เข้ารหัส API key ก่อนเก็บลงฐานข้อมูล (AES-256-GCM)
 *
 * - คีย์เข้ารหัสมาจาก env AI_KEYS_SECRET เท่านั้น (ไม่มีค่า default ในโค้ด)
 *   รองรับ: hex 64 ตัว / base64 32 ไบต์ / ข้อความยาว ๆ (จะ derive ด้วย scrypt)
 * - ถ้าไม่ได้ตั้ง env นี้ ระบบจะไม่ยอมเก็บ key ลงฐานข้อมูล (ไม่มีการเก็บแบบ plaintext เด็ดขาด)
 * - ค่าที่เก็บมีรูปแบบ v1.<iv>.<tag>.<ciphertext> (base64url)
 *
 * ไฟล์นี้ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";
const SALT = "dropway-ai-keys-v1";

function secretKey(): Buffer | null {
  const raw = (process.env.AI_KEYS_SECRET ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // ไม่ใช่ base64 — ไป derive ต่อ
  }
  return scryptSync(raw, SALT, 32);
}

/** ตั้งค่า secret ไว้หรือยัง (ใช้บอกผู้ใช้ในหน้าตั้งค่า) */
export function isKeyEncryptionReady(): boolean {
  return secretKey() !== null;
}

export function encryptSecret(plain: string): string | null {
  const key = secretKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** คืน null ถ้าถอดไม่ได้ (secret เปลี่ยน/ข้อมูลเสีย) — ไม่ throw ให้คำขอหลักพัง */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = secretKey();
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
