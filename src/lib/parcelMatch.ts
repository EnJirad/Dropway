import type { House } from "@/types/house";

export type MatchLevel = "exact" | "high" | "medium";

export type HouseMatch = {
  house: House;
  score: number;
  level: MatchLevel;
  matched: { name: boolean; houseNo: boolean; phone: boolean };
  /** เหตุผลที่จับคู่ (แสดงให้ผู้ใช้เห็น) */
  reasons: string[];
  /** ข้อมูลที่ขัดแย้ง เช่น เบอร์บนฉลากไม่ตรงกับเบอร์ในคลัง */
  conflicts: string[];
};

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TITLE_RE =
  /^(นางสาว|นาง|นาย|น\.ส\.|น\.ส|นส\.|คุณ|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|miss|ms\.?)\s*/i;

// สร้างด้วย RegExp เพื่อใช้ \p{...} โดยไม่ผูกกับ target ของ TypeScript
const NON_ALNUM = new RegExp("[^\\p{L}\\p{N}\\p{M}]", "gu");
const MARKS = new RegExp("\\p{M}", "gu");

/** ตัดช่องว่าง เครื่องหมาย และสระ/วรรณยุกต์ลอย (OCR ภาษาไทยอ่านพลาดบ่อย) */
function skeleton(value: string): string {
  return value.toLowerCase().replace(NON_ALNUM, "").replace(MARKS, "");
}

function bigrams(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) out.push(value.slice(i, i + 2));
  return out;
}

/** เลขพัสดุ: ลำดับความน่าจะเป็น รูปแบบไปรษณีย์/ขนส่งที่รู้จัก > ตัวอักษร+ตัวเลข > ตัวเลขล้วน */
export function extractTracking(text: string): string | null {
  const upper = text.replace(UUID_G, " ").toUpperCase();
  const tokens = upper.match(/\b[A-Z0-9]{8,20}\b/g) ?? [];
  let best: string | null = null;
  let bestRank = 0;
  for (const token of tokens) {
    if (token.replace(/\D/g, "").length < 6) continue;
    if (/^0\d{9}$/.test(token)) continue; // เบอร์โทร
    let rank = 1;
    if (
      /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(token) ||
      /^(TH|SPX|KEX|FLASH|JT|LEX|SHP|NIM|BEST|DHL)/.test(token)
    ) {
      rank = 3;
    } else if (/[A-Z]/.test(token)) {
      rank = 2;
    }
    if (rank > bestRank) {
      best = token;
      bestRank = rank;
    }
  }
  return best;
}

function nameScore(fullName: string | null, textSkel: string): number {
  if (!fullName) return 0;
  const base = fullName.trim();
  const noTitle = base.replace(TITLE_RE, "");
  const name = noTitle.length >= 2 ? noTitle : base;
  const full = skeleton(name);
  if (full.length < 3) return 0;
  if (textSkel.includes(full)) return 1;

  let best = 0;
  const tokens = name
    .split(/\s+/)
    .map(skeleton)
    .filter((t) => t.length >= 3);
  if (tokens.length > 0) {
    const hit = tokens.filter((t) => textSkel.includes(t)).length;
    best = hit / tokens.length;
  }
  if (full.length >= 5) {
    const grams = bigrams(full);
    const pool = new Set(bigrams(textSkel));
    const coverage = grams.filter((g) => pool.has(g)).length / grams.length;
    if (coverage >= 0.85) best = Math.max(best, 0.8);
  }
  return best;
}

function usableNumber(n: string): boolean {
  return n.length >= 2 || n.includes("/");
}

/** บ้านเลขที่จากที่อยู่: ตัวเลขก่อน "ม." / "หมู่" เช่น "590 | 347 ม.3" → 590, 347 */
function houseNumbers(address: string | null): string[] {
  if (!address) return [];
  const head = address.split(/ม\.|หมู่|moo|\bm\./i)[0];
  return (head.match(/\d{1,5}(?:\/\d{1,4})?/g) ?? []).filter(usableNumber);
}

function textNumbers(text: string): Set<string> {
  const cleaned = text.replace(/(?:ม\.|หมู่(?:ที่)?|moo\.?)\s*\d+/gi, " ");
  const found = new Set<string>();
  const re = /(?:^|\D)(\d{1,5}(?:\/\d{1,4})?)(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    if (usableNumber(m[1])) found.add(m[1]);
  }
  return found;
}

/** เบอร์โทรไทยที่พบในข้อความ (ตัดช่องว่าง/ขีด แล้วหาเบอร์มือถือ 10 หลัก หรือเบอร์บ้าน 9 หลัก) */
function phonesInText(text: string): string[] {
  const compact = text.replace(/[\s-]/g, "");
  return compact.match(/0[689]\d{8}|0[2-7]\d{7}/g) ?? [];
}

/**
 * เทียบข้อความจากฉลาก (OCR / บาร์โค้ด) กับบ้านในคลัง
 * ใช้ ชื่อ, เบอร์โทร และบ้านเลขที่ เท่านั้น (เลขพัสดุเป็นของพัสดุ ไม่ใช่ตัวระบุบ้าน)
 * ผลลัพธ์บอกเหตุผลและข้อมูลที่ขัดแย้งด้วย
 */
export function matchHouses(houses: House[], text: string): HouseMatch[] {
  const textSkel = skeleton(text.replace(UUID_G, " "));
  const nums = textNumbers(text);
  const digits = text.replace(/\D/g, "");
  const labelPhones = phonesInText(text);
  const out: HouseMatch[] = [];

  for (const house of houses) {
    const n = nameScore(house.full_name, textSkel);
    const name = n >= 0.6;
    const houseNo = houseNumbers(house.address).some((x) => nums.has(x));
    const phoneDigits = (house.phone ?? "").replace(/\D/g, "").slice(-9);
    const phone = phoneDigits.length === 9 && digits.includes(phoneDigits);

    const score = (phone ? 60 : 0) + (name ? Math.round(n * 50) : 0) + (houseNo ? 40 : 0);
    if (score === 0) continue;

    const reasons: string[] = [];
    if (name) reasons.push(n >= 0.99 ? "ชื่อตรง" : "ชื่อใกล้เคียง");
    if (phone) reasons.push("เบอร์โทรตรง");
    if (houseNo) reasons.push("บ้านเลขที่ตรง");

    const conflicts: string[] = [];
    if (phoneDigits.length === 9 && !phone && labelPhones.length > 0) {
      conflicts.push("เบอร์บนฉลากไม่ตรงกับเบอร์ในคลัง");
    }

    let level: MatchLevel = "medium";
    if ((n >= 0.99 && houseNo) || (phone && name)) level = "exact";
    else if (phone || (name && houseNo)) level = "high";
    if (conflicts.length > 0 && level !== "medium") level = "medium";

    out.push({ house, score, level, matched: { name, houseNo, phone }, reasons, conflicts });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
