import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODELS, PROVIDER_IDS, type AiProvider } from "@/lib/aiSettings";
import { ProviderError, providerErrorFromHttp, resolveRetryConfig } from "@/lib/aiRetry";
import { runWithResilience } from "@/lib/aiResilience";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // base64 ~4.5MB

const PROMPT = `คุณคือผู้อ่านฉลากพัสดุของไทย อ่านรูปแล้วดึงข้อมูลของ "ผู้รับ" เท่านั้น (ไม่ใช่ผู้ส่ง)
ตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น ตามรูปแบบนี้:
{"name":"","phone":"","houseNo":"","address":"","postalCode":"","tracking":""}
กติกา:
- name: ชื่อผู้รับ (รวมคำนำหน้าถ้ามี)
- phone: เบอร์โทรผู้รับ เฉพาะตัวเลข
- houseNo: บ้านเลขที่ เช่น 12/3
- address: ที่อยู่ผู้รับเต็ม ไม่ใส่ชื่อ เบอร์ หรือรหัสไปรษณีย์ ใส่หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด
- postalCode: รหัสไปรษณีย์ 5 หลัก
- tracking: เลขพัสดุ
- ช่องที่อ่านไม่ออกหรือไม่แน่ใจให้เป็น "" ห้ามเดาหรือแต่งข้อมูล`;

type Fields = {
  name: string;
  phone: string;
  houseNo: string;
  address: string;
  postalCode: string;
  tracking: string;
};

const MODEL_RE = /^[\w.\-:]{1,80}$/;

function badResponse(): ProviderError {
  return new ProviderError("AI ตอบกลับในรูปแบบที่อ่านไม่ได้", {
    code: "AI_BAD_RESPONSE",
    status: 502,
    retryable: false,
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function parseFields(text: string): Fields {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw badResponse();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw badResponse();
  }
  const postal = str(obj.postalCode).replace(/\D/g, "");
  return {
    name: str(obj.name),
    phone: str(obj.phone).replace(/[^\d]/g, ""),
    houseNo: str(obj.houseNo),
    address: str(obj.address),
    postalCode: /^\d{5}$/.test(postal) ? postal : "",
    tracking: str(obj.tracking).replace(/\s+/g, ""),
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } | string };
    if (typeof j.error === "string") return j.error;
    return j.error?.message ?? "";
  } catch {
    return "";
  }
}

// detail ใช้จำแนกชนิด error เท่านั้น ไม่ใส่ในข้อความที่ส่งกลับหรือ log
function httpError(provider: string, res: Response, detail: string): ProviderError {
  return providerErrorFromHttp(provider, res.status, detail);
}

async function callGemini(
  key: string,
  model: string,
  mime: string,
  b64: string,
  signal: AbortSignal,
): Promise<string> {
  // โมเดล 2.5+ คิดก่อนตอบ (thinking) ทำให้ช้า — ปิดเมื่อโมเดลรองรับ
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    responseMimeType: "application/json",
  };
  if (/gemini-(2\.5|3)/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig,
      }),
    },
  );
  if (!res.ok) throw httpError("Gemini", res, await readError(res));
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function callOpenAI(
  key: string,
  model: string,
  mime: string,
  b64: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw httpError("OpenAI", res, await readError(res));
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(
  key: string,
  model: string,
  mime: string,
  b64: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw httpError("Claude", res, await readError(res));
  const j = (await res.json()) as { content?: { type?: string; text?: string }[] };
  return j.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
}

// POST /api/ai/label - ส่งรูปฉลากให้ AI อ่านแล้วคืนช่องข้อมูลผู้รับ
// key ใช้เฉพาะคำขอนี้ ไม่บันทึกและไม่เขียน log
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const provider = body.provider as AiProvider;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const image = typeof body.image === "string" ? body.image : "";
    const mime = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const model =
      typeof body.model === "string" && /^[\w.\-:]{1,80}$/.test(body.model)
        ? body.model
        : DEFAULT_MODELS[provider as AiProvider];

    if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
      return NextResponse.json({ error: "ผู้ให้บริการ AI ไม่ถูกต้อง" }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: "ยังไม่ได้ใส่ API key" }, { status: 400 });
    }
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
      return NextResponse.json({ error: "ชนิดรูปไม่รองรับ" }, { status: 400 });
    }
    if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image)) {
      return NextResponse.json({ error: "รูปไม่ถูกต้องหรือใหญ่เกินไป" }, { status: 400 });
    }

    const call =
      provider === "gemini" ? callGemini : provider === "openai" ? callOpenAI : callAnthropic;
    const fallbackRaw = typeof body.fallbackModel === "string" ? body.fallbackModel.trim() : "";
    const fallbackModel = MODEL_RE.test(fallbackRaw) ? fallbackRaw : "";
    const config = resolveRetryConfig({ maxAttempts: body.maxAttempts, timeoutMs: body.timeoutMs });

    const result = await runWithResilience({
      models: [model, fallbackModel],
      config,
      call: async (m, signal) => parseFields(await call(apiKey, m, mime, image, signal)),
      // log เฉพาะข้อมูลทางเทคนิค ไม่มี key รูป หรือข้อมูลผู้รับ
      onAttempt: (info) => console.warn("[ai/label] attempt", JSON.stringify({ provider, ...info })),
    });
    return NextResponse.json({
      fields: result.value,
      model: result.model,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { error: error.message, code: error.code, attempts: error.attempts },
        { status: error.status },
      );
    }
    console.error("API /api/ai/label error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "เรียก AI ไม่สำเร็จ", code: "AI_UNAVAILABLE" }, { status: 500 });
  }
}
