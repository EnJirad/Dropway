/**
 * เก็บ/อ่านค่าตั้งค่า AI ในฐานข้อมูล Neon
 *
 * - key ถูกเข้ารหัสด้วย AI_KEYS_SECRET ก่อนเขียนลงตาราง (AES-256-GCM)
 * - ฝั่งเบราว์เซอร์ไม่เคยได้รับ key กลับไป มีแค่ "มีอยู่/ไม่มี" + ท้าย key 4 ตัว
 * - ค่าตั้งที่ไม่ลับ (โหมดสแกน, โมเดล, เวลา ฯลฯ) เก็บเป็น JSONB ในแถวเดียวกัน
 * - แอปนี้ยังไม่มีระบบบัญชีจริง จึงใช้แถวเดียว user_id = 'default'
 *   (เมื่อมี auth ให้เปลี่ยนมาใช้ id ของผู้ใช้)
 */

import { getDb, isNeonConfigured } from "@/lib/db";
import { decryptSecret, encryptSecret, isKeyEncryptionReady, keyHint } from "@/lib/aiKeyCrypto";

export const SETTINGS_USER_ID = "default";

export type PersistedAiSettings = {
  scanMode?: string;
  provider?: string;
  fallbackToOcr?: boolean;
  imageMaxSide?: number;
  aiMaxAttempts?: number;
  aiTimeoutSec?: number;
  models?: Record<string, string>;
  fallbackModels?: Record<string, string>;
};

export type AiSettingsRecord = {
  settings: PersistedAiSettings | null;
  hasKey: boolean;
  hasBackup: boolean;
  hint: string;
  backupHint: string;
  updatedAt: string | null;
};

export function isAiSettingsDbReady(): boolean {
  return isNeonConfigured;
}

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS public.ai_settings (
      user_id TEXT PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      api_key_enc TEXT,
      backup_key_enc TEXT,
      api_key_hint TEXT,
      backup_key_hint TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  tableReady = true;
}

export async function loadAiSettings(): Promise<AiSettingsRecord | null> {
  if (!isNeonConfigured) return null;
  await ensureTable();
  const sql = getDb();
  const rows = (await sql`
    SELECT settings, api_key_enc, backup_key_enc, api_key_hint, backup_key_hint, updated_at
    FROM public.ai_settings
    WHERE user_id = ${SETTINGS_USER_ID}
    LIMIT 1
  `) as {
    settings: PersistedAiSettings | string | null;
    api_key_enc: string | null;
    backup_key_enc: string | null;
    api_key_hint: string | null;
    backup_key_hint: string | null;
    updated_at: string | Date | null;
  }[];

  const row = rows[0];
  if (!row) return null;

  let parsed: PersistedAiSettings | null = null;
  if (row.settings && typeof row.settings === "object") parsed = row.settings as PersistedAiSettings;
  else if (typeof row.settings === "string") {
    try {
      parsed = JSON.parse(row.settings) as PersistedAiSettings;
    } catch {
      parsed = null;
    }
  }

  return {
    settings: parsed,
    hasKey: Boolean(row.api_key_enc),
    hasBackup: Boolean(row.backup_key_enc),
    hint: row.api_key_hint ?? "",
    backupHint: row.backup_key_hint ?? "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export type SaveAiSettingsInput = {
  settings: PersistedAiSettings;
  /** undefined = ไม่แตะของเดิม, "" = ลบ, ค่าอื่น = เขียนทับ */
  apiKey?: string;
  backupKey?: string;
};

export async function saveAiSettings(input: SaveAiSettingsInput): Promise<AiSettingsRecord> {
  if (!isNeonConfigured) throw new Error("ยังไม่ได้ตั้งค่าฐานข้อมูล Neon");
  await ensureTable();
  const sql = getDb();

  const primaryMode = input.apiKey === undefined ? "keep" : input.apiKey.trim() ? "set" : "clear";
  const backupMode =
    input.backupKey === undefined ? "keep" : input.backupKey.trim() ? "set" : "clear";

  if ((primaryMode === "set" || backupMode === "set") && !(await isKeyEncryptionReady())) {
    throw new Error("ยังเตรียมคีย์เข้ารหัสไม่ได้ (ตรวจการเชื่อมต่อฐานข้อมูล)");
  }

  const primaryEnc = primaryMode === "set" ? await encryptSecret(input.apiKey!.trim()) : null;
  const backupEnc = backupMode === "set" ? await encryptSecret(input.backupKey!.trim()) : null;
  if (primaryMode === "set" && !primaryEnc) throw new Error("เข้ารหัส key ไม่สำเร็จ");
  if (backupMode === "set" && !backupEnc) throw new Error("เข้ารหัส key สำรองไม่สำเร็จ");

  const primaryHint = primaryMode === "set" ? keyHint(input.apiKey!.trim()) : "";
  const backupHint = backupMode === "set" ? keyHint(input.backupKey!.trim()) : "";

  await sql`
    INSERT INTO public.ai_settings (
      user_id, settings, api_key_enc, backup_key_enc, api_key_hint, backup_key_hint, updated_at
    ) VALUES (
      ${SETTINGS_USER_ID},
      ${JSON.stringify(input.settings)}::jsonb,
      ${primaryEnc},
      ${backupEnc},
      ${primaryHint},
      ${backupHint},
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      settings = EXCLUDED.settings,
      api_key_enc = CASE
        WHEN ${primaryMode} = 'keep' THEN public.ai_settings.api_key_enc
        WHEN ${primaryMode} = 'clear' THEN NULL
        ELSE EXCLUDED.api_key_enc
      END,
      backup_key_enc = CASE
        WHEN ${backupMode} = 'keep' THEN public.ai_settings.backup_key_enc
        WHEN ${backupMode} = 'clear' THEN NULL
        ELSE EXCLUDED.backup_key_enc
      END,
      api_key_hint = CASE
        WHEN ${primaryMode} = 'keep' THEN public.ai_settings.api_key_hint
        WHEN ${primaryMode} = 'clear' THEN NULL
        ELSE EXCLUDED.api_key_hint
      END,
      backup_key_hint = CASE
        WHEN ${backupMode} = 'keep' THEN public.ai_settings.backup_key_hint
        WHEN ${backupMode} = 'clear' THEN NULL
        ELSE EXCLUDED.backup_key_hint
      END,
      updated_at = now();
  `;

  const saved = await loadAiSettings();
  if (!saved) throw new Error("บันทึกแล้วแต่อ่านค่ากลับไม่ได้");
  return saved;
}

export async function clearAiKeys(): Promise<void> {
  if (!isNeonConfigured) return;
  await ensureTable();
  const sql = getDb();
  await sql`
    UPDATE public.ai_settings
    SET api_key_enc = NULL,
        backup_key_enc = NULL,
        api_key_hint = NULL,
        backup_key_hint = NULL,
        updated_at = now()
    WHERE user_id = ${SETTINGS_USER_ID};
  `;
}

/**
 * ใช้ตอนสแกน: ถ้าเบราว์เซอร์ไม่ได้ส่ง key มา ให้ใช้ key ที่เก็บในฐานข้อมูล
 * คืนค่าว่างเมื่อไม่มี/ถอดรหัสไม่ได้
 */
export async function getStoredAiKeys(): Promise<{ primary: string; backup: string }> {
  if (!isNeonConfigured) return { primary: "", backup: "" };
  const sql = getDb();
  await ensureTable();
  const rows = (await sql`
    SELECT api_key_enc, backup_key_enc
    FROM public.ai_settings
    WHERE user_id = ${SETTINGS_USER_ID}
    LIMIT 1
  `) as { api_key_enc: string | null; backup_key_enc: string | null }[];
  const row = rows[0];
  if (!row) return { primary: "", backup: "" };
  return {
    primary: (await decryptSecret(row.api_key_enc)) ?? "",
    backup: (await decryptSecret(row.backup_key_enc)) ?? "",
  };
}
