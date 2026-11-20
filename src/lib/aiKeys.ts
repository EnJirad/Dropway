/**
 * การเลือก API key สำหรับคำขอ AI หนึ่งครั้ง
 * key สำรองมีไว้สลับเมื่อ "ตัว key เองมีปัญหา" (ลิมิต/โควตา/สิทธิ์)
 * ไม่ใช่เมื่อผู้ให้บริการล่มหรือเน็ตหลุด — กรณีนั้นต้อง retry ที่เดิม ไม่ใช่เปลี่ยน key
 */

import { ProviderError } from "@/lib/aiRetry";

export type KeySlot = {
  key: string;
  slot: "primary" | "backup";
};

/** ลำดับ key ที่จะลอง: primary แล้วค่อย backup (ตัดค่าว่างและค่าซ้ำออก) */
export function buildKeySlots(primary: string, backup: string): KeySlot[] {
  const p = primary.trim();
  const b = backup.trim();
  if (!p) return [];
  const slots: KeySlot[] = [{ key: p, slot: "primary" }];
  if (b && b !== p) slots.push({ key: b, slot: "backup" });
  return slots;
}

/** true เมื่อควรสลับไป key ถัดไป (โควตาหมด/ลิมิต หรือ key ใช้ไม่ได้) */
export function isKeyProblem(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  return error.code === "AI_QUOTA" || error.code === "AI_AUTH";
}
