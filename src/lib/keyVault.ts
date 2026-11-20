/**
 * ที่เก็บ API key ของผู้ใช้ — อยู่ในหน่วยความจำของแท็บนี้เท่านั้น
 *
 * หลักการ:
 * - ไม่เขียนลง localStorage / IndexedDB / cookie / sessionStorage
 * - ไม่ถูกฝังในไฟล์ที่ build ขึ้นเว็บ (ไม่มี NEXT_PUBLIC_*, ไม่มีค่า default)
 * - ปิดแท็บหรือรีเฟรช = key หาย ต้องกรอกใหม่ (ผู้ใช้เป็นเจ้าของ key เอง)
 * - ค่าถูกส่งต่อให้ผู้ให้บริการ AI ผ่าน route /api/ai/label แบบ per-request และไม่ถูกบันทึกที่เซิร์ฟเวอร์
 *
 * ไฟล์นี้ไม่ทำ I/O ใด ๆ จึงไม่มีความเสี่ยงข้อมูลค้างในเครื่อง
 */

export type KeySlot = "primary" | "backup";

const memory = new Map<string, string>();

function cacheKey(provider: string, slot: KeySlot): string {
  return `${provider}:${slot}`;
}

export function readKey(provider: string, slot: KeySlot): string {
  return memory.get(cacheKey(provider, slot)) ?? "";
}

export function writeKey(provider: string, slot: KeySlot, value: string): void {
  const key = cacheKey(provider, slot);
  const v = value.trim();
  if (v) memory.set(key, v);
  else memory.delete(key);
}

export function readProviderKeys(provider: string): { primary: string; backup: string } {
  return {
    primary: readKey(provider, "primary"),
    backup: readKey(provider, "backup"),
  };
}

export function writeProviderKeys(
  provider: string,
  keys: { primary?: string; backup?: string },
): void {
  if (keys.primary !== undefined) writeKey(provider, "primary", keys.primary);
  if (keys.backup !== undefined) writeKey(provider, "backup", keys.backup);
}

/** ล้าง key ทั้งหมดในหน่วยความจำ (ใช้ตอนกด "ล้าง key" หรือออกจากระบบ) */
export function clearVault(): void {
  memory.clear();
}

/** จำนวน key ที่ถืออยู่ตอนนี้ (ใช้แสดงสถานะในหน้าตั้งค่า ไม่เปิดเผยค่า) */
export function vaultCount(): number {
  return memory.size;
}
