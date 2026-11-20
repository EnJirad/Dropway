/**
 * ชนิดข้อผิดพลาดของผู้ให้บริการ AI และค่าตั้งค่า retry
 * ไฟล์นี้ไม่เก็บและไม่รับข้อมูลพัสดุ รูปภาพ หรือ API key
 */

export type AiErrorCode =
  | "AI_AUTH"
  | "AI_QUOTA"
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_BAD_RESPONSE";

export type ProviderErrorInit = {
  code: AiErrorCode;
  /** HTTP status ที่ route จะตอบกลับ */
  status: number;
  /** ลองซ้ำกับโมเดลเดิมได้ (503, timeout, เครือข่าย) */
  retryable: boolean;
  /** หยุดทันที ไม่ลองโมเดลอื่น (key ผิด) */
  fatal?: boolean;
  /** HTTP status ที่ผู้ให้บริการตอบมา */
  httpStatus?: number;
};

export class ProviderError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly httpStatus?: number;
  /** จำนวนครั้งที่เรียกผู้ให้บริการจริงก่อนล้มเหลว (ตั้งโดย runWithResilience) */
  attempts = 0;

  constructor(message: string, init: ProviderErrorInit) {
    super(message);
    Object.setPrototypeOf(this, ProviderError.prototype);
    this.name = "ProviderError";
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable;
    this.fatal = init.fatal ?? false;
    this.httpStatus = init.httpStatus;
  }
}

export function timeoutError(): ProviderError {
  return new ProviderError("AI ตอบช้าเกินกำหนด", {
    code: "AI_TIMEOUT",
    status: 504,
    retryable: true,
  });
}

/** แปลงสถานะ HTTP ของผู้ให้บริการเป็นข้อผิดพลาดที่ระบุได้ว่าควร retry หรือข้ามไปโมเดลสำรอง */
export function providerErrorFromHttp(provider: string, httpStatus: number, detail = ""): ProviderError {
  if (httpStatus === 401 || httpStatus === 403 || (httpStatus === 400 && /api key/i.test(detail))) {
    return new ProviderError(`API key ของ ${provider} ไม่ถูกต้องหรือไม่มีสิทธิ์`, {
      code: "AI_AUTH",
      status: 401,
      retryable: false,
      fatal: true,
      httpStatus,
    });
  }
  if (httpStatus === 429) {
    return new ProviderError(`${provider}: ใช้งานเกินโควตาหรือเครดิตหมด`, {
      code: "AI_QUOTA",
      status: 429,
      retryable: false,
      httpStatus,
    });
  }
  if ([408, 500, 502, 503, 504].indexOf(httpStatus) >= 0) {
    return new ProviderError(`${provider} ใช้งานหนาแน่นหรือไม่พร้อมให้บริการชั่วคราว`, {
      code: "AI_UNAVAILABLE",
      status: 503,
      retryable: true,
      httpStatus,
    });
  }
  return new ProviderError(`${provider} ตอบกลับผิดพลาด (${httpStatus})`, {
    code: "AI_BAD_RESPONSE",
    status: 502,
    retryable: false,
    httpStatus,
  });
}

/** error ที่ไม่ใช่ ProviderError (timeout ของ fetch, เครือข่ายหลุด) ถือเป็นชั่วคราว */
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const name = e instanceof Error ? e.name : "";
  if (name === "AbortError" || name === "TimeoutError") return timeoutError();
  return new ProviderError("เชื่อมต่อผู้ให้บริการ AI ไม่ได้", {
    code: "AI_UNAVAILABLE",
    status: 503,
    retryable: true,
  });
}

export type RetryConfig = {
  /** จำนวนครั้งสูงสุดต่อโมเดล (รวมครั้งแรก) */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** เวลารอสูงสุดต่อการเรียกหนึ่งครั้ง */
  timeoutMs: number;
  /** เวลารวมสูงสุดของทุกโมเดลและทุกครั้ง */
  totalBudgetMs: number;
};

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 2,
  baseDelayMs: 400,
  maxDelayMs: 2000,
  timeoutMs: 12_000,
  totalBudgetMs: 20_000,
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * ค่าเริ่มต้นมาจาก env (AI_RETRY_MAX_ATTEMPTS, AI_REQUEST_TIMEOUT_MS, AI_RETRY_BASE_MS,
 * AI_RETRY_MAX_DELAY_MS, AI_TOTAL_BUDGET_MS) คำขอปรับ maxAttempts/timeoutMs ได้ แต่ถูกจำกัดช่วงเสมอ
 */
export function resolveRetryConfig(
  request: { maxAttempts?: unknown; timeoutMs?: unknown } = {},
  env: Record<string, string | undefined> = process.env,
): RetryConfig {
  const envAttempts = clampInt(env.AI_RETRY_MAX_ATTEMPTS, 1, 4, DEFAULT_RETRY.maxAttempts);
  const envTimeout = clampInt(env.AI_REQUEST_TIMEOUT_MS, 3000, 30_000, DEFAULT_RETRY.timeoutMs);
  const baseDelayMs = clampInt(env.AI_RETRY_BASE_MS, 0, 5000, DEFAULT_RETRY.baseDelayMs);
  const maxDelayMs = Math.max(
    baseDelayMs,
    clampInt(env.AI_RETRY_MAX_DELAY_MS, 0, 15_000, DEFAULT_RETRY.maxDelayMs),
  );
  return {
    maxAttempts: clampInt(request.maxAttempts, 1, 4, envAttempts),
    baseDelayMs,
    maxDelayMs,
    timeoutMs: clampInt(request.timeoutMs, 3000, 30_000, envTimeout),
    totalBudgetMs: clampInt(env.AI_TOTAL_BUDGET_MS, 3000, 40_000, DEFAULT_RETRY.totalBudgetMs),
  };
}

/** exponential backoff แบบ equal jitter: ครึ่งหนึ่งคงที่ อีกครึ่งสุ่ม จำกัดไม่เกิน maxDelayMs */
export function backoffDelay(attempt: number, cfg: RetryConfig, random: () => number): number {
  const cap = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.round(cap / 2 + random() * (cap / 2));
}
