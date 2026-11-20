import { composeAddress, parseLabel, type LabelFields } from "@/lib/labelParse";
import { cleanFields, invalidFields, readConfidence } from "@/lib/labelValidate";

const KEYS: (keyof LabelFields)[] = ["name", "phone", "houseNo", "address", "postalCode", "tracking"];

export function emptyFields(): LabelFields {
  return { name: "", phone: "", houseNo: "", address: "", postalCode: "", tracking: "" };
}

function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** รับค่าอะไรก็ได้ (undefined, null, ขาดบางช่อง) แล้วคืนช่องครบทุกตัวที่ "ผ่านการทำความสะอาด" แล้ว */
export function normalizeFields(v: unknown): LabelFields {
  return cleanFields(v);
}

export function hasAnyField(f: LabelFields): boolean {
  return KEYS.some((k) => f[k] !== "");
}

/**
 * รวมผลแบบรู้ทันความมั่นใจ: ช่องที่ AI อ่านได้และผ่านการตรวจจะชนะ
 * ยกเว้น AI ระบุ confidence = low และ OCR มีค่าที่ผ่านการตรวจ — ให้ใช้ของ OCR
 * ช่องที่ AI ส่งมาแต่ผิดรูป (เบอร์ 9 หลัก, tracking ทั้งบรรทัด) จะไม่ทับของ OCR
 */
export function mergeFields(
  ai: unknown,
  ocr: unknown,
  confidence?: Record<string, string>,
): LabelFields {
  const a = normalizeFields(ai);
  const o = normalizeFields(ocr);
  const aiBad = invalidFields(a);
  const ocrBad = invalidFields(o);
  const out = emptyFields();
  for (const k of KEYS) {
    const aiValue = a[k];
    const ocrValue = o[k];
    const aiOk = aiValue !== "" && aiBad.indexOf(k) < 0;
    const ocrOk = ocrValue !== "" && ocrBad.indexOf(k) < 0;
    const aiLow = confidence?.[k] === "low";
    if (aiOk && !(aiLow && ocrOk)) out[k] = aiValue;
    else if (ocrOk) out[k] = ocrValue;
    else out[k] = aiValue || ocrValue;
  }
  return out;
}

/** แปลงช่องเป็นข้อความ เพื่อส่งเข้าตัวเทียบบ้านชุดเดิม */
export function fieldsToText(f: LabelFields): string {
  return [f.name, composeAddress(f), f.phone, f.tracking ? `เลขพัสดุ ${f.tracking}` : ""]
    .filter((s) => s.trim())
    .join("\n");
}

export type AiInput =
  | { ok: true; fields?: unknown; confidence?: unknown }
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

  const fields = mergeFields(
    aiFields,
    ocrFields,
    ai && ai.ok ? readConfidence(ai.confidence) : undefined,
  );
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
