/**
 * ทำความสะอาด + ตรวจความถูกต้องของแต่ละช่อง (ใช้ร่วม client และ server)
 *
 * เป้าหมาย: กันค่า "ดูมีข้อมูลแต่ใช้ไม่ได้" เช่น เบอร์ 9 หลัก, รหัสไปรษณีย์ 4 หลัก,
 * tracking ที่ลอกมาทั้งบรรทัด, หรือที่อยู่ที่มีแต่ชื่อสินค้า
 * ไฟล์นี้ไม่มี I/O ไม่แตะ DOM จึงเรียกได้ทั้งสองฝั่ง
 */

import type { LabelFields } from "@/lib/labelParse";

export const FIELD_KEYS: (keyof LabelFields)[] = [
  "name",
  "phone",
  "houseNo",
  "address",
  "postalCode",
  "tracking",
];

export type FieldKey = keyof LabelFields;
export type FieldConfidence = "high" | "medium" | "low";
export type ConfidenceMap = Partial<Record<FieldKey, FieldConfidence>>;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/** เบอร์โทร: เก็บตัวเลข, แปลง +66/66 นำหน้าเป็น 0, คืนค่าเมื่อได้ 9-10 หลักขึ้นต้น 0 */
export function normalizePhone(raw: unknown): string {
  let digits = text(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("66")) digits = `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("660")) digits = `0${digits.slice(3)}`;
  if (digits.length === 13 && digits.startsWith("0066")) digits = `0${digits.slice(4)}`;
  return /^0\d{8,9}$/.test(digits) ? digits : "";
}

/** ไปรษณีย์ไทย 10xxx-96xxx — เลือกกลุ่ม 5 หลักแรกที่เจอ */
export function normalizePostal(raw: unknown): string {
  const s = text(raw);
  const direct = s.replace(/\D/g, "");
  if (/^[1-9]\d{4}$/.test(direct)) return direct;
  const m = s.match(/(?:^|\D)([1-9]\d{4})(?!\d)/);
  return m ? m[1] : "";
}

/** บ้านเลขที่: 1-5 หลัก มี / ได้ 1-4 หลัก เช่น 12/3, 247/147 */
export function normalizeHouseNo(raw: unknown): string {
  const s = text(raw);
  const m = s.match(/\d{1,5}(?:\/\d{1,4})?/);
  return m ? m[0] : "";
}

/** tracking: ตัวพิมพ์ใหญ่ ไม่มีช่องว่าง/ขีด, 8-40 ตัว, ต้องมีตัวเลข */
export function normalizeTracking(raw: unknown): string {
  const s = text(raw)
    .toUpperCase()
    .replace(/[\s\-_]+/g, "")
    .replace(/[^A-Z0-9]/g, "");
  if (s.length < 8 || s.length > 40) return "";
  if (!/\d/.test(s)) return "";
  return s;
}

/** ชื่อผู้รับ: ตัดคำกำกับ/เครื่องหมายตกแต่ง ไม่ให้เกิน 80 ตัวอักษร */
export function normalizeName(raw: unknown): string {
  let s = text(raw)
    .replace(/\s+/g, " ")
    .replace(/^[\s~*•·-]+|[\s~*•·-]+$/g, "")
    .replace(/^(ผู้รับ(?:ปลายทาง)?|ชื่อผู้รับ|ถึง|ส่งถึง|to|recipient)\s*[:：]?\s*/i, "")
    .trim();
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s;
}

/** ที่อยู่: ยุบบรรทัด/ช่องว่างซ้ำ แต่ "ไม่" ตัดส่วนใดทิ้ง */
export function normalizeAddress(raw: unknown): string {
  return text(raw)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
}

/** แปลงทุกช่องให้เป็นรูปแบบมาตรฐาน (ค่าที่ผิดรูปจะกลายเป็น "") */
export function cleanFields(input: unknown): LabelFields {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    name: normalizeName(o.name),
    phone: normalizePhone(o.phone),
    houseNo: normalizeHouseNo(o.houseNo),
    address: normalizeAddress(o.address),
    postalCode: normalizePostal(o.postalCode),
    tracking: normalizeTracking(o.tracking),
  };
}

/** ช่องที่ "มีค่าแต่ใช้ไม่ได้" — ใช้ตัดสินว่าจะเชื่อ AI หรือใช้ OCR แทน */
export function invalidFields(f: LabelFields): FieldKey[] {
  const bad: FieldKey[] = [];
  if (f.name && f.name.length < 2) bad.push("name");
  if (f.name && /^\d+$/.test(f.name)) bad.push("name");
  if (f.address && f.address.length < 8) bad.push("address");
  if (f.houseNo && !/^\d{1,5}(?:\/\d{1,4})?$/.test(f.houseNo)) bad.push("houseNo");
  if (f.tracking && normalizeTracking(f.tracking) !== f.tracking) bad.push("tracking");
  return bad;
}

/** ช่องสำคัญที่ยังว่างหรือผิดรูป — ใช้สั่งอ่านซ้ำเฉพาะจุด */
export function criticalGaps(f: LabelFields): FieldKey[] {
  const bad = invalidFields(f);
  const gaps: FieldKey[] = [];
  if (!f.name || bad.indexOf("name") >= 0) gaps.push("name");
  if (!f.address || bad.indexOf("address") >= 0) gaps.push("address");
  if (!f.phone) gaps.push("phone");
  if (!f.tracking || bad.indexOf("tracking") >= 0) gaps.push("tracking");
  return gaps;
}

/** อ่าน confidence จากคำตอบดิบ (ถ้าโมเดลไม่ได้ส่งมาก็คืน object ว่าง) */
export function readConfidence(input: unknown): ConfidenceMap {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const c = o.confidence;
  if (!c || typeof c !== "object") return {};
  const src = c as Record<string, unknown>;
  const out: ConfidenceMap = {};
  for (const k of FIELD_KEYS) {
    const v = src[k];
    if (v === "high" || v === "medium" || v === "low") out[k] = v;
  }
  return out;
}
