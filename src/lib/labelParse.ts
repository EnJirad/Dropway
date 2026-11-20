import { extractTracking } from "@/lib/parcelMatch";

/** ข้อมูลที่แยกได้จากฉลาก (ทุกช่องแก้ไขได้ก่อนยืนยัน ช่องที่อ่านไม่ได้เป็นสตริงว่าง ไม่เดา) */
export type LabelFields = {
  name: string;
  phone: string;
  houseNo: string;
  address: string;
  postalCode: string;
  tracking: string;
};

const SENDER_RE = /ผู้ส่ง|ต้นทาง|\bfrom\b|\bsender\b/i;
const RECIPIENT_RE = /ผู้รับ|ผู้รับปลายทาง|ปลายทาง|ส่งถึง|\bto\b|recipient|ship\s*to/i;
const TITLE_LINE_RE =
  /(นางสาว|นาง|นาย|น\.ส\.|นส\.|คุณ|ด\.ช\.|ด\.ญ\.|\bmr\.?|\bmrs\.?|\bmiss\b|\bms\.?)\s*\S+/i;
const ADDRESS_HINT_RE = /ม\.|หมู่|ต\.|อ\.|จ\.|ตำบล|อำเภอ|จังหวัด|ซ\.|ซอย|ถ\.|ถนน|แขวง|เขต|หมู่บ้าน|บ\./;
const PHONE_RE = /0[689]\d{8}|0[2-7]\d{7}/;

function findPhone(line: string): string {
  const compact = line.replace(/[\s-]/g, "");
  return compact.match(PHONE_RE)?.[0] ?? "";
}

function stripLabelPrefix(line: string): string {
  return line
    .replace(/^(ผู้รับ(?:ปลายทาง)?|ส่งถึง|ถึง|ชื่อ|ที่อยู่|เบอร์โทร|โทร|tel\.?|to|recipient|ship\s*to)\s*[:：]?\s*/i, "")
    .trim();
}

/**
 * แยกชื่อ เบอร์ บ้านเลขที่ ที่อยู่ รหัสไปรษณีย์ และเลขพัสดุจากข้อความ OCR
 * ข้ามบรรทัดในส่วนของผู้ส่ง (หลังคำว่า ผู้ส่ง / From จนกว่าจะพบ ผู้รับ / To)
 */
export function parseLabel(text: string): LabelFields {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const recipientLines: string[] = [];
  let mode: "unknown" | "sender" | "recipient" = "unknown";
  for (const line of lines) {
    if (SENDER_RE.test(line) && !RECIPIENT_RE.test(line)) mode = "sender";
    else if (RECIPIENT_RE.test(line)) mode = "recipient";
    if (mode !== "sender") recipientLines.push(line);
  }

  const tracking = extractTracking(text) ?? "";

  let phone = "";
  for (const line of recipientLines) {
    phone = findPhone(line);
    if (phone) break;
  }

  let name = "";
  for (const line of recipientLines) {
    if (!TITLE_LINE_RE.test(line) && !RECIPIENT_RE.test(line)) continue;
    const cleaned = stripLabelPrefix(line.replace(PHONE_RE, "")).replace(/[\d/]+$/g, "").trim();
    const m = cleaned.match(TITLE_LINE_RE);
    const candidate = (m ? cleaned.slice(m.index ?? 0) : cleaned).trim();
    if (candidate.length >= 2 && !ADDRESS_HINT_RE.test(candidate.split(" ")[0])) {
      name = candidate;
      break;
    }
  }

  const addressLines = recipientLines
    .filter((l) => ADDRESS_HINT_RE.test(l) || /^\d{1,5}(\/\d{1,4})?\s/.test(l))
    .map((l) => stripLabelPrefix(l).replace(PHONE_RE, "").trim())
    .filter((l) => l && l !== name);
  const address = addressLines.join(" ").trim();

  const head = address.split(/ม\.|หมู่|\bmoo\b/i)[0];
  const houseNo = head.match(/\d{1,5}(?:\/\d{1,4})?/)?.[0] ?? "";

  // ไม่ใช้ spread กับ matchAll เพราะ tsconfig ไม่ได้ตั้ง target (ค่าเริ่มต้น ES5)
  const lastPostal = (s: string): string | undefined => {
    const all = Array.from(s.matchAll(/(?:^|\D)([1-9]\d{4})(?!\d)/g));
    return all.length ? all[all.length - 1][1] : undefined;
  };
  const postalCode = lastPostal(address) ?? lastPostal(recipientLines.join(" ")) ?? "";

  return { name, phone, houseNo, address, postalCode, tracking };
}

/** รวมช่องที่แก้แล้วเป็นที่อยู่บรรทัดเดียวสำหรับบันทึก (ไม่ซ้ำบ้านเลขที่/รหัสไปรษณีย์ที่มีอยู่แล้ว) */
export function composeAddress(f: Pick<LabelFields, "houseNo" | "address" | "postalCode">): string {
  const parts: string[] = [];
  const address = f.address.trim();
  if (f.houseNo.trim() && !address.includes(f.houseNo.trim())) parts.push(f.houseNo.trim());
  if (address) parts.push(address);
  if (f.postalCode.trim() && !address.includes(f.postalCode.trim())) parts.push(f.postalCode.trim());
  return parts.join(" ");
}
