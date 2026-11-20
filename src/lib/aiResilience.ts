import {
  ProviderError,
  backoffDelay,
  timeoutError,
  toProviderError,
  type AiErrorCode,
  type RetryConfig,
} from "@/lib/aiRetry";

/** ข้อมูลของการเรียกแต่ละครั้งสำหรับ log ไม่มีรูป ข้อความฉลาก หรือ key */
export type AttemptInfo = {
  model: string;
  attempt: number;
  ok: boolean;
  code?: AiErrorCode;
  httpStatus?: number;
  elapsedMs: number;
};

export type ResilienceDeps = {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

export type ResilienceResult<T> = {
  value: T;
  model: string;
  usedFallback: boolean;
  attempts: number;
};

/** ไม่เริ่มการเรียกใหม่ถ้าเหลือเวลาน้อยกว่านี้ */
const MIN_ATTEMPT_MS = 250;
/** โมเดลหลักใช้เวลาได้ไม่เกินสัดส่วนนี้ของเวลาที่เหลือ เพื่อเหลือเวลาให้โมเดลสำรอง */
const PRIMARY_SHARE = 0.6;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function attemptOnce<T>(
  call: (model: string, signal: AbortSignal) => Promise<T>,
  model: string,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(model, controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function uniqueModels(models: string[]): string[] {
  const out: string[] = [];
  for (const m of models) {
    const name = typeof m === "string" ? m.trim() : "";
    if (name && out.indexOf(name) < 0) out.push(name);
  }
  return out;
}

/**
 * เรียกผู้ให้บริการแบบมีขอบเขต:
 * - retry เฉพาะข้อผิดพลาดชั่วคราว (503, timeout, เครือข่าย) ด้วย exponential backoff + jitter
 * - หมด retry หรือโมเดลไม่รับ (เช่น 429) แล้วลองโมเดลถัดไปในรายการ
 * - key ผิด (fatal) หยุดทันที
 * - เวลารวมไม่เกิน config.totalBudgetMs
 * ล้มเหลวทั้งหมดจะ throw ProviderError ตัวสุดท้ายพร้อม attempts
 */
export async function runWithResilience<T>(opts: {
  models: string[];
  call: (model: string, signal: AbortSignal) => Promise<T>;
  config: RetryConfig;
  deps?: ResilienceDeps;
  onAttempt?: (info: AttemptInfo) => void;
}): Promise<ResilienceResult<T>> {
  const { call, config, onAttempt } = opts;
  const sleep = opts.deps?.sleep ?? defaultSleep;
  const random = opts.deps?.random ?? Math.random;
  const now = opts.deps?.now ?? Date.now;
  const models = uniqueModels(opts.models);
  const started = now();
  const hardEnd = started + config.totalBudgetMs;
  let attempts = 0;
  let last: ProviderError | null = null;

  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    const isLast = m === models.length - 1;
    const modelEnd = isLast ? hardEnd : Math.min(hardEnd, now() + Math.floor((hardEnd - now()) * PRIMARY_SHARE));

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      const remaining = modelEnd - now();
      if (remaining < MIN_ATTEMPT_MS) break;
      attempts++;
      const t0 = now();
      try {
        const value = await attemptOnce(call, model, Math.min(config.timeoutMs, remaining));
        onAttempt?.({ model, attempt, ok: true, elapsedMs: now() - t0 });
        return { value, model, usedFallback: m > 0, attempts };
      } catch (e) {
        const err = toProviderError(e);
        last = err;
        onAttempt?.({
          model,
          attempt,
          ok: false,
          code: err.code,
          httpStatus: err.httpStatus,
          elapsedMs: now() - t0,
        });
        if (err.fatal) {
          err.attempts = attempts;
          throw err;
        }
        if (!err.retryable) break;
        if (attempt < config.maxAttempts) {
          const delay = backoffDelay(attempt, config, random);
          if (modelEnd - now() - delay < MIN_ATTEMPT_MS) break;
          await sleep(delay);
        }
      }
    }
  }

  const failure =
    last ??
    new ProviderError("AI ไม่พร้อมใช้งาน", { code: "AI_UNAVAILABLE", status: 503, retryable: true });
  failure.attempts = attempts;
  throw failure;
}
