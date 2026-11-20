/**
 * ทำข้อความจาก OCR ให้สะอาดก่อนแยกข้อมูล
 *
 * OCR ภาษาไทยพลาดประจำ 3 แบบ: อ่านเลขไทยเป็นเลขไทย, อ่านตัวเลขเป็นตัวอักษรที่หน้าตาใกล้กัน
 * (O/0, l/1, S/5) และมีอักขระล่องหน/ช่องว่างซ้ำจาก PDF หรือรูปย่อ
 */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** แปลงเลขไทย ๐-๙ เป็น 0-9 (OCR บางรุ่นอ่านเลขไทยออกมาเป็นเลขไทย) */
export function thaiDigitsToArabic(text: string): string {
  if (!/[๐-๙]/.test(text)) return text;
  return text.replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

/** ตัวอักษรที่ OCR มักอ่านสลับกับตัวเลข */
const CONFUSION: Record<string, string> = {
  O: "0",
  o: "0",
  D: "0",
  Q: "0",
  I: "1",
  l: "1",
  "|": "1",
  i: "1",
  S: "5",
  s: "5",
  B: "8",
  Z: "2",
  z: "2",
  G: "6",
};

/**
 * แก้เฉพาะกลุ่มตัวอักษร/ตัวเลขที่ "เกือบเป็นตัวเลข" (มีตัวเลขตั้งแต่ 60% ขึ้นไป)
 * เพื่อไม่ให้ไปทำลายคำอังกฤษหรือคำไทย เช่น SPX12345678 หรือ "ship to"
 */
export function normalizeNumericRuns(text: string): string {
  return text.replace(/[0-9A-Za-z|]{4,}/g, (run) => {
    const digits = (run.match(/\d/g) ?? []).length;
    if (digits === 0 || digits / run.length < 0.6) return run;
    let out = "";
    for (let i = 0; i < run.length; i += 1) {
      const ch = run[i];
      const mapped = CONFUSION[ch];
      out += mapped ?? ch;
    }
    return out;
  });
}

/** รวมทุกขั้นตอนที่ใช้ก่อนแยกข้อมูลฉลาก */
export function normalizeOcrText(text: string): string {
  return normalizeNumericRuns(
    thaiDigitsToArabic(text.replace(ZERO_WIDTH, "")),
  )
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ");
}

/** ตัดอักขระที่ไม่ใช่ตัวเลขออก (ใช้กับเบอร์โทร/รหัสไปรษณีย์) */
export function digitsOnly(text: string): string {
  return normalizeNumericRuns(thaiDigitsToArabic(text)).replace(/\D/g, "");
}
