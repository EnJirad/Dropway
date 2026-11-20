import type { AppSettings } from "@/lib/aiSettings";
import { composeAddress, type LabelFields } from "@/lib/labelParse";

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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ส่งรูปฉลากให้ AI ตามค่าตั้งค่า แล้วคืนช่องข้อมูลผู้รับ (throw Error พร้อมข้อความภาษาไทยถ้าไม่สำเร็จ) */
export async function readLabelWithAi(file: File, settings: AppSettings): Promise<LabelFields> {
  const image = await imageToBase64(file, settings.imageMaxSide);
  const res = await fetch("/api/ai/label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: settings.provider,
      apiKey: settings.apiKeys[settings.provider],
      model: settings.models[settings.provider],
      image,
      mimeType: "image/jpeg",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    fields?: LabelFields;
  };
  if (!res.ok || !json.fields) throw new Error(json.error || "เรียก AI ไม่สำเร็จ");
  return json.fields;
}

/** แปลงช่องที่ AI อ่านได้เป็นข้อความ เพื่อส่งเข้าตัวเทียบบ้านชุดเดิม */
export function fieldsToText(f: LabelFields): string {
  return [
    f.name,
    composeAddress(f),
    f.phone,
    f.tracking ? `เลขพัสดุ ${f.tracking}` : "",
  ]
    .filter((s) => s.trim())
    .join("\n");
}
