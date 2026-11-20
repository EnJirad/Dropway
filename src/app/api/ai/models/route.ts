import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_IDS, type AiProvider } from "@/lib/aiSettings";
import type { AiModelInfo } from "@/lib/aiModels";

export const dynamic = "force-dynamic";

type Body = { provider?: unknown; apiKey?: unknown };

const PROVIDER_NAMES: Record<AiProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
};

const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; models: AiModelInfo[] }>();

function isProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

function cacheKey(provider: AiProvider, key: string): string {
  // ไม่เก็บ key ดิบเป็นชื่อ cache — ใช้ความยาว + 4 ตัวท้ายพอแยกความต่าง
  return `${provider}:${key.length}:${key.slice(-4)}`;
}

function statusMessage(provider: AiProvider, status: number, detail: string): string {
  const name = PROVIDER_NAMES[provider];
  if (/API_KEY_INVALID|api key not valid|invalid api key|incorrect api key/i.test(detail)) {
    return `API key ของ ${name} ไม่ถูกต้องหรือไม่มีสิทธิ์`;
  }
  if (status === 401 || status === 403 || status === 400) {
    return `API key ของ ${name} ไม่ถูกต้องหรือไม่มีสิทธิ์`;
  }
  if (status === 429) return `โควตาของ ${name} ถูกจำกัดชั่วคราว ลองใหม่ภายหลัง`;
  if (status === 404) return `ไม่พบรายการโมเดลของ ${name}`;
  return `${name} ตอบกลับผิดพลาด (HTTP ${status})`;
}

/** ข้อผิดพลาดจากผู้ให้บริการที่ยังต้องรู้ HTTP status กับรายละเอียด */
class UpstreamError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(String(status));
    this.name = "UpstreamError";
    this.status = status;
    this.detail = detail;
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new UpstreamError(res.status, detail.slice(0, 600));
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function listGemini(key: string): Promise<AiModelInfo[]> {
  const json = (await fetchJson(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
    { method: "GET", headers: { "x-goog-api-key": key } },
  )) as { models?: unknown };

  const out: AiModelInfo[] = [];
  for (const raw of asArray(json.models)) {
    const model = raw as Record<string, unknown>;
    const methods = asArray(model.supportedGenerationMethods).map(text);
    if (!methods.includes("generateContent")) continue;
    const name = text(model.name).replace(/^models\//, "");
    if (!name) continue;
    if (/embedding|aqa|imagen|veo|tts|audio|live|image-generation/i.test(name)) continue;
    out.push({ id: name, label: text(model.displayName) || name, vision: true });
  }
  return out;
}

async function listOpenAI(key: string): Promise<AiModelInfo[]> {
  const json = (await fetchJson("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  })) as { data?: unknown };

  const out: AiModelInfo[] = [];
  for (const raw of asArray(json.data)) {
    const model = raw as Record<string, unknown>;
    const id = text(model.id);
    if (!id) continue;
    if (!/^(gpt-|o\d|chatgpt-)/i.test(id)) continue;
    if (/whisper|tts|dall-e|embedding|moderation|transcribe|realtime|audio|search|image-1/i.test(id)) continue;
    const vision = /gpt-4o|gpt-4\.1|gpt-5|^o[1-9]/i.test(id);
    out.push({ id, label: id, vision });
  }
  return out;
}

async function listAnthropic(key: string): Promise<AiModelInfo[]> {
  const json = (await fetchJson("https://api.anthropic.com/v1/models?limit=100", {
    method: "GET",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  })) as { data?: unknown };

  const out: AiModelInfo[] = [];
  for (const raw of asArray(json.data)) {
    const model = raw as Record<string, unknown>;
    const id = text(model.id);
    if (!id) continue;
    out.push({ id, label: text(model.display_name) || id, vision: true });
  }
  return out;
}

function sortModels(models: AiModelInfo[]): AiModelInfo[] {
  return models.slice().sort((a, b) => {
    if (a.vision !== b.vision) return a.vision ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const provider = body.provider;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!isProvider(provider)) {
    return NextResponse.json({ error: "ผู้ให้บริการไม่ถูกต้อง", models: [] }, { status: 400 });
  }
  if (!apiKey || apiKey.length > 300) {
    return NextResponse.json({ error: "ยังไม่ได้ใส่ API key", models: [] }, { status: 400 });
  }

  const key = cacheKey(provider, apiKey);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ models: hit.models, cached: true });
  }

  try {
    const models =
      provider === "gemini"
        ? await listGemini(apiKey)
        : provider === "openai"
          ? await listOpenAI(apiKey)
          : await listAnthropic(apiKey);

    const sorted = sortModels(models);
    cache.set(key, { at: Date.now(), models: sorted });
    return NextResponse.json({ models: sorted, cached: false });
  } catch (error) {
    if (error instanceof UpstreamError) {
      return NextResponse.json(
        { error: statusMessage(provider, error.status, error.detail), models: [] },
        { status: error.status },
      );
    }
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? `${PROVIDER_NAMES[provider]} ตอบช้าเกินกำหนด ลองใหม่`
          : `เชื่อมต่อ ${PROVIDER_NAMES[provider]} ไม่ได้`,
        models: [],
      },
      { status: 502 },
    );
  }
}
