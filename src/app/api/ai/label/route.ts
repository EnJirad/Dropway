import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODELS, PROVIDER_IDS, type AiProvider } from "@/lib/aiSettings";
import { ProviderError, providerErrorFromHttp, resolveRetryConfig } from "@/lib/aiRetry";
import { buildKeySlots, isKeyProblem } from "@/lib/aiKeys";
import { getStoredAiKeys } from "@/lib/aiSettingsDb";
import { runWithResilience, type ResilienceResult } from "@/lib/aiResilience";
import { LABEL_JSON_SCHEMA, LABEL_PROMPT, buildFocusPrompt } from "@/lib/labelPrompt";
import type { LabelFields } from "@/lib/labelParse";
import {
  cleanFields,
  criticalGaps,
  readConfidence,
  type ConfidenceMap,
  type FieldKey,
} from "@/lib/labelValidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // base64 ~4.5MB

const MODEL_RE = /^[\w.\-:]{1,80}$/;

type ReadResult = { fields: LabelFields; confidence: ConfidenceMap };

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

/** ตัดเฉพาะก้อน JSON แรกแล้วทำความสะอาดทุกช่อง (ค่าที่ผิดรูปจะกลายเป็น "") */
function parseResult(text: string): ReadResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw badResponse();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw badResponse();
  }
  const raw = {
    name: str(obj.name),
    phone: str(obj.phone),
    houseNo: str(obj.houseNo),
    address: str(obj.address),
    postalCode: str(obj.postalCode),
    tracking: str(obj.tracking),
  };
  return { fields: cleanFields(raw), confidence: readConfidence(obj) };
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
  prompt: string,
): Promise<string> {
  // โมเดล 2.5+ คิดก่อนตอบ (thinking) ทำให้ช้า — ปิดเมื่อโมเดลรองรับ
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    responseMimeType: "application/json",
    // บังคับโครงคำตอบก่อนถึงชั้น parse: ชนิดข้อมูลถูก ไม่มี markdown หลุด
    responseSchema: LABEL_JSON_SCHEMA,
    maxOutputTokens: 700,
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
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
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
  prompt: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
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
  prompt: string,
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
      max_tokens: 700,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw httpError("Claude", res, await readError(res));
  const j = (await res.json()) as { content?: { type?: string; text?: string }[] };
  return j.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
}

/** เติมเฉพาะช่องที่ขาดจากรอบสอง ไม่ทับค่าที่อ่านได้แล้ว */
function fillGaps(
  base: LabelFields,
  extra: LabelFields,
  gaps: FieldKey[],
): LabelFields {
  const out: LabelFields = { ...base };
  for (const key of gaps) {
    const value = extra[key];
    if (!value) continue;
    if (key === "address") {
      // ที่อยู่รอบสองใช้ได้เฉพาะเมื่อยาวกว่าของเดิม (กันที่อยู่สั้นที่ตัดท่อนทิ้ง)
      if (value.length >= out.address.length) out.address = value;
      continue;
    }
    if (!out[key]) out[key] = value;
  }
  return out;
}

// POST /api/ai/label - ส่งรูปฉลากให้ AI อ่านแล้วคืนช่องข้อมูลผู้รับ
// key ใช้เฉพาะคำขอนี้ ไม่บันทึกและไม่เขียน log
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const provider = body.provider as AiProvider;
    // key มาจาก header เป็นหลัก (ไม่ปนใน JSON body ที่อาจถูก log โดย proxy)
    // ยังอ่านจาก body ได้เพื่อความเข้ากันได้กับไคลเอนต์รุ่นเก่า
    const headerKey = request.headers.get("x-ai-key");
    const headerBackup = request.headers.get("x-ai-key-backup");
    const apiKey =
      (typeof headerKey === "string" && headerKey.trim()) ||
      (typeof body.apiKey === "string" ? body.apiKey.trim() : "");
    const backupApiKey =
      (typeof headerBackup === "string" && headerBackup.trim()) ||
      (typeof body.backupApiKey === "string" ? body.backupApiKey.trim() : "");
    const image = typeof body.image === "string" ? body.image : "";
    const mime = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const model =
      typeof body.model === "string" && MODEL_RE.test(body.model)
        ? body.model
        : DEFAULT_MODELS[provider as AiProvider];

    if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
      return NextResponse.json({ error: "ผู้ให้บริการ AI ไม่ถูกต้อง" }, { status: 400 });
    }

    // ถ้าเบราว์เซอร์ไม่ได้ส่ง key มา ให้ใช้ key ที่บันทึกไว้ในฐานข้อมูล
    // (ผู้ใช้กรอกครั้งเดียวในหน้าตั้งค่าแล้วสแกนได้ทันทีโดยไม่ต้องกรอกซ้ำ)
    let resolvedKey = apiKey;
    let resolvedBackup = backupApiKey;
    if (!resolvedKey || !resolvedBackup) {
      try {
        const stored = await getStoredAiKeys();
        if (!resolvedKey) resolvedKey = stored.primary;
        if (!resolvedBackup) resolvedBackup = stored.backup;
      } catch {
        // ฐานข้อมูลไม่พร้อม — ใช้เฉพาะ key ที่ส่งมาจากเบราว์เซอร์
      }
    }
    if (!resolvedKey) {
      return NextResponse.json(
        { error: "ยังไม่มี API key — กรอกในหน้าตั้งค่าแล้วกดบันทึกก่อน" },
        { status: 400 },
      );
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

    // ลำดับ key: หลักก่อน แล้วค่อยสำรอง — สลับเมื่อ key หลักติดโควตาหรือสิทธิ์
    const keys = buildKeySlots(resolvedKey, resolvedBackup);
    if (!keys.length) {
      return NextResponse.json({ error: "ยังไม่ได้ใส่ API key" }, { status: 400 });
    }

    let first: ResilienceResult<ReadResult> | null = null;
    let usedBackupKey = false;
    let keyIndexUsed = 0;
    let lastKeyError: ProviderError | null = null;

    for (let i = 0; i < keys.length; i++) {
      try {
        first = await runWithResilience({
          models: [model, fallbackModel],
          config,
          call: async (m, signal) =>
            parseResult(await call(keys[i].key, m, mime, image, signal, LABEL_PROMPT)),
          // log เฉพาะข้อมูลทางเทคนิค ไม่มี key รูป หรือข้อมูลผู้รับ
          onAttempt: (info) =>
            console.warn(
              "[ai/label] attempt",
              JSON.stringify({ provider, keySlot: keys[i].slot, ...info }),
            ),
        });
        keyIndexUsed = i;
        usedBackupKey = i > 0;
        break;
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        lastKeyError = e;
        // สลับไป key สำรองเฉพาะเมื่อปัญหาอยู่ที่ key ไม่ใช่ที่เน็ต/เซิร์ฟเวอร์ผู้ให้บริการ
        const keyProblem = isKeyProblem(e);
        if (!keyProblem || i === keys.length - 1) throw e;
        console.warn("[ai/label] primary key unavailable, switching to backup", e.code);
      }
    }
    if (!first) {
      throw (
        lastKeyError ??
        new ProviderError("AI ไม่พร้อมใช้งาน", {
          code: "AI_UNAVAILABLE",
          status: 503,
          retryable: true,
        })
      );
    }

    let fields = first.value.fields;
    let modelUsed = first.model;
    const usedFallback = first.usedFallback;
    let confidence = first.value.confidence;
    const callKey = keys[keyIndexUsed].key;

    // รอบสอง: อ่านซ้ำเฉพาะช่องสำคัญที่ยังขาด/ผิดรูป (จำกัดเวลาและครั้ง)
    // ไม่ยิงเพิ่มเพียงเพราะไม่มีเลขพัสดุ — ใบหลายใบไม่มีเลขนี้พิมพ์อยู่ และการยิงซ้ำมีต้นทุน
    const gaps = criticalGaps(fields);
    const worthRetry = gaps.some((k) => k !== "tracking");
    if (worthRetry) {
      try {
        const focus = await runWithResilience({
          models: [first.model],
          config: {
            ...config,
            maxAttempts: 1,
            timeoutMs: Math.min(config.timeoutMs, 12_000),
            totalBudgetMs: Math.min(config.totalBudgetMs, 14_000),
          },
          call: async (m, signal) =>
            parseResult(await call(callKey, m, mime, image, signal, buildFocusPrompt(gaps))),
        });
        fields = fillGaps(fields, focus.value.fields, gaps);
        confidence = { ...confidence, ...focus.value.confidence };
        modelUsed = focus.model;
      } catch (e) {
        // รอบสองล้มเหลวไม่ทำให้คำขอแรกเสีย — คืนผลรอบแรกพร้อมบอกช่องที่ยังขาด
        if (!(e instanceof ProviderError)) throw e;
        console.warn("[ai/label] focus pass failed", e.code);
      }
    }

    const finalFields = cleanFields(fields);
    return NextResponse.json(
      {
        fields: finalFields,
        model: modelUsed,
        usedFallback,
        usedBackupKey,
        missing: criticalGaps(finalFields),
        confidence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
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
