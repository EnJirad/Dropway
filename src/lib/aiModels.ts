import type { AiProvider } from "@/lib/aiSettings";

/** โมเดลที่ผู้ให้บริการยืนยันว่า key นี้เรียกได้ */
export type AiModelInfo = {
  id: string;
  label: string;
  /** โมเดลนี้อ่านรูปได้ (ใช้กับงานสแกนฉลาก) */
  vision: boolean;
};

const CLIENT_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; models: AiModelInfo[] }>();

type Response = {
  models?: unknown;
  error?: unknown;
  cached?: unknown;
};

function cacheKey(provider: AiProvider, key: string): string {
  return `${provider}:${key.length}:${key.slice(-4)}`;
}

function normalize(value: unknown): AiModelInfo[] {
  if (!Array.isArray(value)) return [];
  const out: AiModelInfo[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    out.push({
      id,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : id,
      vision: item.vision === true,
    });
  }
  return out;
}

/**
 * ดึงรายการโมเดลของ key นั้นจากเซิร์ฟเวอร์ (ซึ่งถามผู้ให้บริการให้)
 * ไม่ throw — คืน { ok: false, message } เพื่อให้หน้า settings แสดงสถานะได้
 */
export async function listProviderModels(
  provider: AiProvider,
  apiKey: string,
  options: { force?: boolean } = {},
): Promise<{ ok: true; models: AiModelInfo[]; cached: boolean } | { ok: false; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "ใส่ API key ก่อนเพื่อดูรายการโมเดล" };

  const cacheId = cacheKey(provider, key);
  const hit = cache.get(cacheId);
  if (!options.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, models: hit.models, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ai/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ provider, apiKey: key }),
    });
    const json = (await res.json().catch(() => null)) as Response | null;
    if (!res.ok || !json) {
      return {
        ok: false,
        message:
          (typeof json?.error === "string" && json.error) ||
          `ตรวจรายการโมเดลไม่สำเร็จ (HTTP ${res.status})`,
      };
    }
    const models = normalize(json.models);
    cache.set(cacheId, { at: Date.now(), models });
    return { ok: true, models, cached: json.cached === true };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: aborted ? "ตรวจรายการโมเดลช้าเกินกำหนด" : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** ล้าง cache (เช่น หลังผู้ใช้ลบ key) */
export function clearModelCache(provider?: AiProvider): void {
  if (!provider) {
    cache.clear();
    return;
  }
  for (const id of Array.from(cache.keys())) {
    if (id.startsWith(`${provider}:`)) cache.delete(id);
  }
}
