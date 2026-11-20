export const PROVIDER_IDS = ["gemini", "openai", "anthropic"] as const;
export type AiProvider = (typeof PROVIDER_IDS)[number];

export type ProviderInfo = {
  id: AiProvider;
  name: string;
  maker: string;
  summary: string;
  pricing: string;
  keyUrl: string;
  keyPrefix: string;
  models: string[];
  recommended?: boolean;
};

/** ผู้ให้บริการ AI ที่อ่านรูปได้ (vision) ราคา/โควตาเปลี่ยนได้ ให้ตรวจที่เว็บผู้ให้บริการอีกครั้ง */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    maker: "Google AI Studio",
    summary: "อ่านภาษาไทยจากรูปได้ดี เร็ว เหมาะกับฉลากพัสดุ",
    pricing: "มีแพ็กเกจฟรี (จำกัดจำนวนครั้งต่อวัน) เหมาะเริ่มทดลอง",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AIza...",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    recommended: true,
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    maker: "OpenAI Platform",
    summary: "อ่านภาพและข้อความได้แม่น ใช้งานแพร่หลาย",
    pricing: "จ่ายตามการใช้งาน ต้องเติมเครดิตก่อน",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-...",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    maker: "Anthropic Console",
    summary: "อ่านตัวหนังสือในรูปได้ละเอียด เหมาะกับฉลากที่พิมพ์เล็ก",
    pricing: "จ่ายตามการใช้งาน ต้องเติมเครดิตก่อน",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-...",
    models: ["claude-3-5-haiku-latest", "claude-sonnet-4-5"],
  },
];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

/** โมเดลสำรองเริ่มต้น ใช้เมื่อโมเดลหลักล้มเหลวต่อเนื่อง (ค่าว่าง = ไม่ใช้โมเดลสำรอง) */
export const DEFAULT_FALLBACK_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash-lite",
  openai: "",
  anthropic: "",
};

export const AI_ATTEMPT_OPTIONS = [1, 2, 3, 4] as const;
export const AI_TIMEOUT_OPTIONS = [10, 15, 20, 30] as const;

export type ScanMode = "ocr" | "ai";
export const IMAGE_SIDES = [1280, 1600, 2048] as const;
export type ImageMaxSide = (typeof IMAGE_SIDES)[number];

export type AppSettings = {
  scanMode: ScanMode;
  provider: AiProvider;
  apiKeys: Record<AiProvider, string>;
  models: Record<AiProvider, string>;
  /** ถ้า AI ใช้ไม่ได้ ให้ลองอ่านด้วย OCR ในเครื่องต่อ */
  fallbackToOcr: boolean;
  /** ด้านที่ยาวที่สุดของรูปที่ส่งให้ AI (พิกเซล) */
  imageMaxSide: ImageMaxSide;
  /** โมเดลสำรองต่อผู้ให้บริการ ใช้เมื่อโมเดลหลักไม่พร้อม (ว่าง = ปิด) */
  fallbackModels: Record<AiProvider, string>;
  /** จำนวนครั้งสูงสุดต่อโมเดลเมื่อเจอ error ชั่วคราว เช่น 503 (รวมครั้งแรก) */
  aiMaxAttempts: number;
  /** เวลารอ AI ต่อหนึ่งครั้ง (วินาที) */
  aiTimeoutSec: number;
};

export function defaultSettings(): AppSettings {
  return {
    scanMode: "ocr",
    provider: "gemini",
    apiKeys: { gemini: "", openai: "", anthropic: "" },
    models: { ...DEFAULT_MODELS },
    fallbackToOcr: true,
    // 1600px: ตัวอักษรไทยบนใบปะหน้าเล็กกว่าภาษาลาติน ต้องเก็บรายละเอียดมากกว่าภาพตัวอย่างทั่วไป
    imageMaxSide: 1600,
    fallbackModels: { ...DEFAULT_FALLBACK_MODELS },
    aiMaxAttempts: 2,
    aiTimeoutSec: 15,
  };
}

const STORAGE_KEY = "dropway_settings_v1";

function isProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

/** อ่านค่าตั้งค่าจากเบราว์เซอร์ (ถ้าอ่านไม่ได้หรือข้อมูลเสีย ใช้ค่าเริ่มต้น) */
export function loadSettings(): AppSettings {
  const base = defaultSettings();
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<AppSettings> | null;
    if (!p || typeof p !== "object") return base;
    if (p.scanMode === "ai" || p.scanMode === "ocr") base.scanMode = p.scanMode;
    if (isProvider(p.provider)) base.provider = p.provider;
    if (typeof p.fallbackToOcr === "boolean") base.fallbackToOcr = p.fallbackToOcr;
    if ((AI_ATTEMPT_OPTIONS as readonly number[]).includes(p.aiMaxAttempts as number)) {
      base.aiMaxAttempts = p.aiMaxAttempts as number;
    }
    if ((AI_TIMEOUT_OPTIONS as readonly number[]).includes(p.aiTimeoutSec as number)) {
      base.aiTimeoutSec = p.aiTimeoutSec as number;
    }
    if ((IMAGE_SIDES as readonly number[]).includes(p.imageMaxSide as number)) {
      base.imageMaxSide = p.imageMaxSide as ImageMaxSide;
    }
    for (const id of PROVIDER_IDS) {
      const key = p.apiKeys?.[id];
      if (typeof key === "string") base.apiKeys[id] = key;
      const model = p.models?.[id];
      if (typeof model === "string" && model.trim()) base.models[id] = model.trim();
      const fallback = p.fallbackModels?.[id];
      if (typeof fallback === "string") base.fallbackModels[id] = fallback.trim();
    }
  } catch {
    // storage ถูกบล็อกหรือ JSON เสีย
  }
  return base;
}

/** บันทึกค่าตั้งค่า คืน false ถ้าเบราว์เซอร์ไม่ยอมให้เขียน */
export function saveSettings(settings: AppSettings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** ใช้ AI ได้เมื่อเลือกโหมด AI และมี key ของผู้ให้บริการที่เลือก */
export function isAiReady(s: AppSettings): boolean {
  return s.scanMode === "ai" && s.apiKeys[s.provider].trim().length > 0;
}

/** รูปแบบ key ของแต่ละเจ้า — ใช้เดาว่าวาง key ของใครเข้ามา */
const KEY_PATTERNS: { provider: AiProvider; re: RegExp }[] = [
  // ต้องเช็ค Anthropic ก่อน OpenAI เพราะขึ้นต้นด้วย sk- เหมือนกัน
  { provider: "anthropic", re: /^sk-ant-(?:api\d\d-)?[A-Za-z0-9_-]{16,}$/ },
  { provider: "gemini", re: /^AIza[0-9A-Za-z_-]{30,}$/ },
  { provider: "openai", re: /^sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/ },
];

/** เดาผู้ให้บริการจาก API key ที่วางเข้ามา (null = จำไม่ได้) */
export function detectProvider(key: string): AiProvider | null {
  const value = key.trim();
  if (!value || value.length > 300) return null;
  for (const pattern of KEY_PATTERNS) {
    if (pattern.re.test(value)) return pattern.provider;
  }
  return null;
}

/** ชื่อผู้ให้บริการสำหรับข้อความบนหน้าจอ */
export function providerName(provider: AiProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return k ? "••••" : "";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}
