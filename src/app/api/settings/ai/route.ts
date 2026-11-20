import { NextRequest, NextResponse } from "next/server";
import {
  clearAiKeys,
  isAiSettingsDbReady,
  loadAiSettings,
  saveAiSettings,
  type PersistedAiSettings,
} from "@/lib/aiSettingsDb";
import { isKeyEncryptionReady } from "@/lib/aiKeyCrypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function modelsRecord(v: unknown): Record<string, string> | undefined {
  const src = asRecord(v);
  const out: Record<string, string> = {};
  for (const id of ["gemini", "openai", "anthropic"]) {
    const value = str(src[id], 80);
    if (value) out[id] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** รับเฉพาะค่าที่รู้จัก เพื่อไม่ให้ JSONB ยัดอะไรแปลกปลอมลงฐานข้อมูล */
function sanitizeSettings(v: unknown): PersistedAiSettings {
  const src = asRecord(v);
  const out: PersistedAiSettings = {};
  if (src.scanMode === "ai" || src.scanMode === "ocr") out.scanMode = src.scanMode;
  if (["gemini", "openai", "anthropic"].includes(String(src.provider))) {
    out.provider = String(src.provider);
  }
  if (typeof src.fallbackToOcr === "boolean") out.fallbackToOcr = src.fallbackToOcr;
  const side = clampInt(src.imageMaxSide, 512, 4096);
  if (side) out.imageMaxSide = side;
  const attempts = clampInt(src.aiMaxAttempts, 1, 4);
  if (attempts) out.aiMaxAttempts = attempts;
  const timeout = clampInt(src.aiTimeoutSec, 5, 60);
  if (timeout) out.aiTimeoutSec = timeout;
  const models = modelsRecord(src.models);
  if (models) out.models = models;
  const fallbackModels = modelsRecord(src.fallbackModels);
  if (fallbackModels) out.fallbackModels = fallbackModels;
  return out;
}

function publicState(record: Awaited<ReturnType<typeof loadAiSettings>>) {
  return {
    settings: record?.settings ?? null,
    hasKey: record?.hasKey ?? false,
    hasBackup: record?.hasBackup ?? false,
    hint: record?.hint ?? "",
    backupHint: record?.backupHint ?? "",
    updatedAt: record?.updatedAt ?? null,
  };
}

function dbUnavailable() {
  return NextResponse.json(
    { error: "ยังไม่ได้ตั้งค่าฐานข้อมูล Neon (DATABASE_URL)" },
    { status: 503, headers: NO_STORE },
  );
}

async function encryptionReady(): Promise<boolean> {
  try {
    return await isKeyEncryptionReady();
  } catch {
    return false;
  }
}

// GET /api/settings/ai — อ่านค่าที่บันทึกไว้ (ไม่คืน key เด็ดขาด)
export async function GET() {
  if (!isAiSettingsDbReady()) return dbUnavailable();
  try {
    const record = await loadAiSettings();
    return NextResponse.json(
      {
        ok: true,
        dbReady: true,
        encryptionReady: await encryptionReady(),
        ...publicState(record),
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "อ่านค่าตั้งค่าจากฐานข้อมูลไม่สำเร็จ" },
      { status: 500, headers: NO_STORE },
    );
  }
}

// PUT /api/settings/ai — บันทึกค่าตั้งค่า + key (ถ้ามีส่งมา)
export async function PUT(request: NextRequest) {
  if (!isAiSettingsDbReady()) return dbUnavailable();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = sanitizeSettings(body.settings);

    // undefined = ไม่แตะ key เดิม, "" = ลบ, ค่าอื่น = เขียนทับ
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey.trim().slice(0, 500) : undefined;
    const backupKey =
      typeof body.backupKey === "string" ? body.backupKey.trim().slice(0, 500) : undefined;

    if ((apiKey || backupKey) && !(await encryptionReady())) {
      return NextResponse.json(
        {
          error:
            "ยังเตรียมคีย์เข้ารหัสไม่ได้ — ตรวจการเชื่อมต่อฐานข้อมูล (หรือตั้ง AI_KEYS_SECRET)",
        },
        { status: 503, headers: NO_STORE },
      );
    }

    const record = await saveAiSettings({ settings, apiKey, backupKey });
    return NextResponse.json(
      {
        ok: true,
        dbReady: true,
        encryptionReady: await encryptionReady(),
        ...publicState(record),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกค่าไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}

// DELETE /api/settings/ai — ลบ key ที่เก็บในฐานข้อมูล (ไม่แตะค่าตั้งอื่น)
export async function DELETE() {
  if (!isAiSettingsDbReady()) return dbUnavailable();
  try {
    await clearAiKeys();
    const record = await loadAiSettings();
    return NextResponse.json(
      { ok: true, ...publicState(record) },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "ลบ key ในฐานข้อมูลไม่สำเร็จ" },
      { status: 500, headers: NO_STORE },
    );
  }
}
