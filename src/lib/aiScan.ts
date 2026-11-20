import type { AppSettings } from "@/lib/aiSettings";
import type { LabelFields } from "@/lib/labelParse";
import type { ConfidenceMap } from "@/lib/labelValidate";
import { normalizeFields } from "@/lib/scanMerge";

/** เพดานสุดท้ายฝั่งเบราว์เซอร์ เซิร์ฟเวอร์จำกัดเวลารวมของตัวเองไว้ต่ำกว่านี้แล้ว */
const CLIENT_TIMEOUT_MS = 25_000;

export type AiScanResult =
  | {
      ok: true;
      fields: LabelFields;
      model: string | null;
      usedFallback: boolean;
      /** ระดับความมั่นใจต่อช่องที่ AI รายงานมา (ใช้ตัดสินตอนรวมผลกับ OCR) */
      confidence: ConfidenceMap;
      /** ช่องสำคัญที่ยังขาดหลังอ่านซ้ำแล้ว (ไว้เตือนผู้ใช้ให้ตรวจ) */
      missing: string[];
    }
  | { ok: false; code: string; message: string };

/** ย่อรูปให้ด้านยาวสุดไม่เกิน maxSide แล้วแปลงเป็น JPEG base64 (ไม่มี prefix data:) */
async function imageToBase64(file: File, maxSide: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("เปิดรูปไม่ได้"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ย่อรูปไม่ได้");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type LabelResponse = {
  error?: string;
  code?: string;
  attempts?: number;
  fields?: unknown;
  model?: string;
  usedFallback?: boolean;
  confidence?: unknown;
  missing?: unknown;
};

/**
 * ส่งรูปฉลากให้ AI ตามค่าตั้งค่า ฟังก์ชันนี้ไม่ throw: ถ้า AI ใช้ไม่ได้จะคืน { ok: false }
 * เพื่อให้หน้าสแกนเก็บผล OCR ไว้และให้ผู้ใช้แก้ข้อมูลต่อได้
 */
export async function readLabelWithAi(file: File, settings: AppSettings): Promise<AiScanResult> {
  let image: string;
  try {
    image = await imageToBase64(file, settings.imageMaxSide);
  } catch {
    return { ok: false, code: "AI_IMAGE", message: "เตรียมรูปส่งให้ AI ไม่ได้" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ai/label", {
      method: "POST",
      // key เดินทางไปกับ header ของคำขอนี้เท่านั้น ไม่ฝังใน body/log
      headers: {
        "Content-Type": "application/json",
        "x-ai-key": settings.apiKeys[settings.provider] ?? "",
        "x-ai-key-backup": settings.backupApiKeys[settings.provider] ?? "",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        provider: settings.provider,
        model: settings.models[settings.provider],
        fallbackModel: settings.fallbackModels[settings.provider],
        maxAttempts: settings.aiMaxAttempts,
        timeoutMs: settings.aiTimeoutSec * 1000,
        image,
        mimeType: "image/jpeg",
      }),
    });
    const json = (await res.json().catch(() => null)) as LabelResponse | null;
    if (!res.ok || !json || !json.fields) {
      const tried =
        json && typeof json.attempts === "number" && json.attempts > 1
          ? ` ลองแล้ว ${json.attempts} ครั้ง`
          : "";
      const base = json?.error || `AI ตอบกลับไม่ได้ (HTTP ${res.status})`;
      return { ok: false, code: json?.code || "AI_UNAVAILABLE", message: `${base}${tried}` };
    }
    const missing = Array.isArray(json.missing)
      ? json.missing.filter((k): k is string => typeof k === "string")
      : [];
    const rawConfidence =
      json.confidence && typeof json.confidence === "object"
        ? (json.confidence as Record<string, unknown>)
        : {};
    const confidence: ConfidenceMap = {};
    for (const k of ["name", "phone", "houseNo", "address", "postalCode", "tracking"] as const) {
      const v = rawConfidence[k];
      if (v === "high" || v === "medium" || v === "low") confidence[k] = v;
    }
    return {
      ok: true,
      fields: normalizeFields(json.fields),
      model: typeof json.model === "string" ? json.model : null,
      usedFallback: json.usedFallback === true,
      confidence,
      missing,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
      message: aborted ? "AI ตอบช้าเกินกำหนด" : "เชื่อมต่อ AI ไม่ได้",
    };
  } finally {
    clearTimeout(timer);
  }
}
