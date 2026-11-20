import { composeAddress, parseLabel, type LabelFields } from "@/lib/labelParse";

const KEYS: (keyof LabelFields)[] = ["name", "phone", "houseNo", "address", "postalCode", "tracking"];

export function emptyFields(): LabelFields {
  return { name: "", phone: "", houseNo: "", address: "", postalCode: "", tracking: "" };
}

function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** รับค่าอะไรก็ได้ (undefined, null, ขาดบางช่อง) แล้วคืนช่องครบทุกตัวเป็นสตริงเสมอ */
export function normalizeFields(v: unknown): LabelFields {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = emptyFields();
  for (const k of KEYS) out[k] = asText(o[k]);
  return out;
}

export function hasAnyField(f: LabelFields): boolean {
  return KEYS.some((k) => f[k] !== "");
}

/** รวมผล: ช่องที่ AI อ่านได้ใช้ของ AI ช่องที่ AI ว่างเว้นไว้ใช้ของ OCR ไม่ให้ค่าว่างทับของที่อ่านได้แล้ว */
export function mergeFields(ai: unknown, ocr: unknown): LabelFields {
  const a = normalizeFields(ai);
  const o = normalizeFields(ocr);
  const out = emptyFields();
  for (const k of KEYS) out[k] = a[k] || o[k];
  return out;
}

/** แปลงช่องเป็นข้อความ เพื่อส่งเข้าตัวเทียบบ้านชุดเดิม */
export function fieldsToText(f: LabelFields): string {
  return [f.name, composeAddress(f), f.phone, f.tracking ? `เลขพัสดุ ${f.tracking}` : ""]
    .filter((s) => s.trim())
    .join("\n");
}

export type AiInput =
  | { ok: true; fields?: unknown }
  | { ok: false; message?: string }
  | null
  | undefined;

export type AiStatus = "off" | "ok" | "empty" | "unavailable";
export type OcrStatus = "ok" | "empty" | "failed" | "skipped";

export type ScanOutcome = {
  fields: LabelFields;
  /** ข้อความสำหรับเทียบบ้าน (ว่างเมื่อไม่มีข้อมูลเลย) */
  text: string;
  source: "ai+ocr" | "ai" | "ocr" | "none";
  aiStatus: AiStatus;
  aiMessage: string;
  ocrStatus: OcrStatus;
};

export function buildScanOutcome(input: {
  ocrText?: string | null;
  ocrFailed?: boolean;
  ocrSkipped?: boolean;
  ai?: AiInput;
}): ScanOutcome {
  const ocrText = typeof input.ocrText === "string" ? input.ocrText.trim() : "";
  const ocrStatus: OcrStatus = input.ocrSkipped
    ? "skipped"
    : input.ocrFailed
      ? "failed"
      : ocrText
        ? "ok"
        : "empty";
  const ocrFields = ocrStatus === "ok" ? parseLabel(ocrText) : null;

  const ai = input.ai;
  let aiStatus: AiStatus = "off";
  let aiMessage = "";
  let aiFields: LabelFields | null = null;
  if (ai && ai.ok) {
    const normalized = normalizeFields(ai.fields);
    if (hasAnyField(normalized)) {
      aiStatus = "ok";
      aiFields = normalized;
    } else {
      aiStatus = "empty";
    }
  } else if (ai && !ai.ok) {
    aiStatus = "unavailable";
    aiMessage = asText(ai.message);
  }

  const fields = mergeFields(aiFields, ocrFields);
  const hasOcr = ocrFields !== null && hasAnyField(ocrFields);
  const source: ScanOutcome["source"] = aiFields
    ? hasOcr
      ? "ai+ocr"
      : "ai"
    : ocrStatus === "ok"
      ? "ocr"
      : "none";
  const text = aiFields ? fieldsToText(fields) : ocrStatus === "ok" ? ocrText : "";

  return { fields, text, source, aiStatus, aiMessage, ocrStatus };
}

export type ScanNotice = { tone: "warn" | "error"; text: string };

/** ข้อความสถานะให้ผู้ใช้เห็นหลังสแกน (null = ไม่มีอะไรต้องเตือน) */
export function describeScanStatus(o: ScanOutcome): ScanNotice | null {
  const detail = o.aiMessage ? ` (${o.aiMessage})` : "";
  const ocrOk = o.ocrStatus === "ok";
  if (o.aiStatus === "unavailable") {
    if (ocrOk) {
      return {
        tone: "warn",
        text: `AI วิเคราะห์ไม่ได้ชั่วคราว${detail} ใช้ผลอ่านจาก OCR ในเครื่องแทน ตรวจและแก้ไขข้อมูลก่อนใช้งาน`,
      };
    }
    if (o.ocrStatus === "skipped") {
      return {
        tone: "warn",
        text: `AI วิเคราะห์ไม่ได้${detail} และปิด OCR สำรองไว้ กรอกข้อมูลเองได้ หรือเปิด OCR สำรองในหน้าตั้งค่า`,
      };
    }
    return {
      tone: "error",
      text: `AI วิเคราะห์ไม่ได้${detail} และ OCR ในเครื่องอ่านข้อความไม่ได้ กรอกข้อมูลเองหรือถ่ายรูปใหม่`,
    };
  }
  if (o.aiStatus === "empty") {
    return ocrOk
      ? { tone: "warn", text: "AI อ่านข้อมูลจากรูปนี้ไม่ได้ ใช้ผลอ่านจาก OCR ในเครื่องแทน ตรวจและแก้ไขข้อมูลก่อนใช้งาน" }
      : { tone: "error", text: "AI และ OCR ในเครื่องอ่านข้อมูลจากรูปนี้ไม่ได้ กรอกข้อมูลเองหรือถ่ายรูปใหม่ให้ชัดขึ้น" };
  }
  if (o.aiStatus === "off") {
    if (o.ocrStatus === "failed") {
      return { tone: "error", text: "OCR ในเครื่องทำงานไม่สำเร็จ กรอกข้อมูลเองหรือถ่ายรูปใหม่" };
    }
    if (o.ocrStatus === "empty") {
      return { tone: "error", text: "อ่านข้อความจากรูปไม่ได้ ลองถ่ายให้ชัดขึ้นหรือกรอกข้อมูลเอง" };
    }
  }
  return null;
}
