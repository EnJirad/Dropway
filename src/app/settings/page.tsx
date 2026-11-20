"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ScanText,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  DEFAULT_MODELS,
  IMAGE_SIDES,
  PROVIDERS,
  defaultSettings,
  detectProvider,
  loadSettings,
  maskKey,
  providerName,
  saveSettings,
  type AiProvider,
  type AppSettings,
  type ImageMaxSide,
} from "@/lib/aiSettings";
import { listProviderModels, type AiModelInfo } from "@/lib/aiModels";

/** ชุดค่าความเร็ว: จำนวนครั้งที่ลองใหม่ + เวลารอต่อครั้ง (วินาที) */
const SPEED_PRESETS = [
  { id: "fast", label: "เร็วสุด", desc: "ลอง 1 ครั้ง · รอ 10 วิ", attempts: 1, timeout: 10 },
  { id: "balanced", label: "สมดุล", desc: "ลอง 2 ครั้ง · รอ 15 วิ", attempts: 2, timeout: 15 },
  { id: "thorough", label: "ละเอียด", desc: "ลอง 3 ครั้ง · รอ 30 วิ", attempts: 3, timeout: 30 },
] as const;

type ModelState = "idle" | "loading" | "ok" | "error";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showBackupKey, setShowBackupKey] = useState(false);
  const [useCustomModel, setUseCustomModel] = useState(false);

  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [modelError, setModelError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const info = PROVIDERS.find((p) => p.id === settings.provider) ?? PROVIDERS[0];
  const key = settings.apiKeys[settings.provider];
  const backupKey = settings.backupApiKeys[settings.provider] ?? "";
  const model = settings.models[settings.provider];
  const detected = detectProvider(key);
  const backupDetected = detectProvider(backupKey);

  const patch = (next: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...next }));

  const setKeyFor = (provider: AiProvider, value: string) =>
    setSettings((s) => ({ ...s, apiKeys: { ...s.apiKeys, [provider]: value } }));

  const setBackupKeyFor = (provider: AiProvider, value: string) =>
    setSettings((s) => ({
      ...s,
      backupApiKeys: { ...s.backupApiKeys, [provider]: value },
    }));

  const setModelFor = (provider: AiProvider, value: string) =>
    setSettings((s) => ({ ...s, models: { ...s.models, [provider]: value } }));

  const selectProvider = (id: AiProvider) => {
    setShowKey(false);
    setUseCustomModel(false);
    patch({ provider: id });
  };

  /** วาง key แล้วเดาเจ้าของให้เอง แล้วสลับไปเจ้านั้นทันที */
  const onKeyChange = (value: string) => {
    const target = detectProvider(value);
    if (target && target !== settings.provider) {
      setUseCustomModel(false);
      setShowKey(false);
      setSettings((s) => ({
        ...s,
        provider: target,
        apiKeys: { ...s.apiKeys, [target]: value },
      }));
      toast.success(`ตรวจพบ key ของ ${providerName(target)}`);
      return;
    }
    setKeyFor(settings.provider, value);
  };

  const loadModels = useCallback(
    async (force: boolean) => {
      const currentKey = settings.apiKeys[settings.provider].trim();
      if (!currentKey) return;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setModelState("loading");
      setModelError("");
      const result = await listProviderModels(settings.provider, currentKey, { force });
      if (requestId !== requestRef.current) return;
      if (result.ok) {
        setModels(result.models);
        setModelState("ok");
      } else {
        setModels([]);
        setModelState("error");
        setModelError(result.message);
      }
    },
    [settings.provider, settings.apiKeys],
  );

  // ตรวจรายการโมเดลจริงหลังผู้ใช้หยุดพิมพ์ key (debounce)
  useEffect(() => {
    if (!loaded) return;
    const currentKey = settings.apiKeys[settings.provider].trim();
    if (!currentKey) {
      requestRef.current += 1;
      setModels([]);
      setModelState("idle");
      setModelError("");
      return;
    }
    const timer = setTimeout(() => {
      void loadModels(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [loaded, loadModels, settings.apiKeys, settings.provider]);

  const modelInList = useMemo(() => models.some((m) => m.id === model), [models, model]);
  const visionCount = useMemo(() => models.filter((m) => m.vision).length, [models]);
  const speedPreset = useMemo(() => {
    const found = SPEED_PRESETS.find(
      (p) => p.attempts === settings.aiMaxAttempts && p.timeout === settings.aiTimeoutSec,
    );
    return found ? found.id : "";
  }, [settings.aiMaxAttempts, settings.aiTimeoutSec]);

  const save = () => {
    if (settings.scanMode === "ai" && !key.trim()) {
      toast.error(`ใส่ API key ของ ${info.name} ก่อนเปิดโหมด AI`);
      return;
    }
    const trimmedBackup = backupKey.trim();
    if (trimmedBackup && trimmedBackup === key.trim()) {
      toast.error("key สำรองซ้ำกับ key หลัก — ใช้คนละ key ถึงจะช่วยตอนติดลิมิตได้");
      return;
    }
    const next: AppSettings = {
      ...settings,
      apiKeys: { ...settings.apiKeys, [settings.provider]: key.trim() },
      backupApiKeys: {
        ...settings.backupApiKeys,
        [settings.provider]: trimmedBackup,
      },
      models: {
        ...settings.models,
        [settings.provider]: model.trim() || DEFAULT_MODELS[settings.provider],
      },
    };
    if (saveSettings(next)) {
      setSettings(next);
      toast.success("บันทึกแล้ว — key อยู่ในแท็บนี้เท่านั้น ปิดแท็บต้องกรอกใหม่");
    } else {
      toast.error("บันทึกไม่ได้ เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล");
    }
  };

  const clearKey = () => {
    requestRef.current += 1;
    setModels([]);
    setModelState("idle");
    const cleared: AppSettings = {
      ...settings,
      apiKeys: { ...settings.apiKeys, [settings.provider]: "" },
      backupApiKeys: { ...settings.backupApiKeys, [settings.provider]: "" },
    };
    setSettings(cleared);
    // ล้างในหน่วยความจำทันที ไม่รอให้กดบันทึก
    saveSettings(cleared);
    toast.success("ล้าง key หลักและ key สำรองออกจากหน่วยความจำแล้ว");
  };

  return (
    <div className="page-shell mx-auto max-w-xl px-4 py-6 pb-32 sm:py-8 md:pb-8">
      <div className="mb-5">
        <h1 className="page-title">
          <Settings className="h-7 w-7 text-teal-700" aria-hidden="true" />
          ตั้งค่า
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-600">
          แบ่งเป็น 2 ส่วน: OCR ในเครื่อง และ AI ที่ใช้อ่านรูป
        </p>
      </div>

      {/* ================= OCR ================= */}
      <section className="card p-4 sm:p-5" aria-labelledby="ocr-group-title">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="ocr-group-title"
            className="flex items-center gap-2 text-sm font-bold text-gray-900"
          >
            <ScanText className="h-4 w-4 text-teal-700" aria-hidden="true" />
            OCR ในเครื่อง
          </h2>
          <span
            className={`badge ${
              settings.scanMode === "ocr" ? "badge-teal" : settings.fallbackToOcr ? "badge-slate" : "badge-amber"
            }`}
          >
            {settings.scanMode === "ocr"
              ? "ใช้เป็นตัวหลัก"
              : settings.fallbackToOcr
                ? "ใช้เป็นตัวสำรอง"
                : "ปิดอยู่"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          อ่านข้อความจากรูปในเครื่อง ฟรี ไม่ต้องใช้ key — ใช้ CPU ของมือถือจึงช้ากว่า AI เล็กน้อย
        </p>

        <div className="mt-3 rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-900">วิธีอ่านฉลาก</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีอ่านฉลาก">
            {(
              [
                { id: "ocr", title: "OCR", desc: "ฟรี เร็ว ไม่ต้องใช้ key" },
                { id: "ai", title: "AI", desc: "แม่นกว่า ต้องมี key" },
              ] as const
            ).map((mode) => {
              const active = settings.scanMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => patch({ scanMode: mode.id })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-teal-600 bg-teal-50 font-bold text-teal-900"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block">{mode.title}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                    {mode.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.fallbackToOcr}
            onChange={(event) => patch({ fallbackToOcr: event.target.checked })}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block font-medium text-gray-900">ใช้ OCR สำรองเมื่อ AI ใช้ไม่ได้</span>
            <span className="block text-xs text-gray-500">
              key ผิด เครดิตหมด หรือเน็ตมีปัญหา — ระบบจะอ่านด้วย OCR ต่อทันที
            </span>
          </span>
        </label>

        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          ระบบเก็บ worker ของ OCR ไว้ใช้ซ้ำและอุ่นไว้ตั้งแต่เปิดหน้า จึงสแกนครั้งต่อไปได้เร็วขึ้น
        </p>
      </section>

      {/* ================= AI ================= */}
      <section className="card mt-4 p-4 sm:p-5" aria-labelledby="ai-group-title">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="ai-group-title"
            className="flex items-center gap-2 text-sm font-bold text-gray-900"
          >
            <Sparkles className="h-4 w-4 text-teal-700" aria-hidden="true" />
            AI อ่านรูป
          </h2>
          <span className={`badge ${settings.scanMode === "ai" ? "badge-success" : "badge-slate"}`}>
            {settings.scanMode === "ai" ? "เปิดใช้งาน" : "ปิดอยู่"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          วาง API key แล้วระบบจะเดาเจ้าของ key ให้เอง และแสดงเฉพาะโมเดลที่ key นี้ใช้งานได้จริง
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-[11px] leading-relaxed text-teal-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>
            key ไม่ถูกบันทึกที่ไหน — เก็บเฉพาะในหน่วยความจำของแท็บนี้ ปิดแท็บ/รีเฟรช
            ต้องกรอกใหม่. เว็บไซต์และเซิร์ฟเวอร์ไม่มี key ของผู้ใช้คนไหนเก็บไว้
          </span>
        </div>

        {/* API key + ตรวจเจ้าของ */}
        <label className="mt-4 block text-xs font-medium text-gray-600">
          API key
          <div className="mt-1 flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(event) => onKeyChange(event.target.value)}
              placeholder={`วาง key ที่นี่ (${info.keyPrefix})`}
              autoComplete="off"
              spellCheck={false}
              className="input min-w-0 flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "ซ่อน key" : "แสดง key"}
              className="btn btn-secondary"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </label>

        {detected ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-teal-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ตรวจพบ key ของ {providerName(detected)}
          </p>
        ) : key.trim() ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            รูปแบบ key ไม่ตรงกับเจ้าที่รู้จัก — เลือกผู้ให้บริการเองด้านล่าง
          </p>
        ) : null}

        {loaded && key && !showKey && (
          <span className="mt-1 block text-xs text-gray-500">บันทึกไว้: {maskKey(key)}</span>
        )}

        {/* API key สำรอง — ใช้เมื่อ key หลักติดลิมิต/โควตาหมด */}
        <label className="mt-4 block text-xs font-medium text-gray-600">
          API key สำรอง (ไม่บังคับ)
          <div className="mt-1 flex gap-2">
            <input
              type={showBackupKey ? "text" : "password"}
              value={backupKey}
              onChange={(event) => setBackupKeyFor(settings.provider, event.target.value)}
              placeholder={`key อีกอันของ ${info.name} (${info.keyPrefix})`}
              autoComplete="off"
              spellCheck={false}
              className="input min-w-0 flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowBackupKey((v) => !v)}
              aria-label={showBackupKey ? "ซ่อน key สำรอง" : "แสดง key สำรอง"}
              className="btn btn-secondary"
            >
              {showBackupKey ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          ถ้า key หลักโดน 429 (โควตาหมด/ติดลิมิต) หรือสิทธิ์ไม่พอ ระบบจะสลับไปใช้ key นี้ให้เอง
          แล้วสแกนต่อได้ทันที — ไม่ต้องกดอะไรระหว่างสแกน
        </p>
        {backupDetected && backupDetected !== settings.provider && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            key สำรองดูเป็นของ {providerName(backupDetected)} — จะใช้กับ {info.name} ไม่ได้
          </p>
        )}
        {loaded && backupKey && !showBackupKey && (
          <span className="mt-1 block text-xs text-gray-500">
            บันทึกไว้: {maskKey(backupKey)}
          </span>
        )}

        {/* ผู้ให้บริการ */}
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-600">ผู้ให้บริการ</p>
          <ul className="mt-2 space-y-2">
            {PROVIDERS.map((provider) => {
              const active = provider.id === settings.provider;
              const hasKey = settings.apiKeys[provider.id].trim().length > 0;
              return (
                <li key={provider.id}>
                  <div
                    className={`rounded-xl border p-3 ${
                      active ? "border-teal-600 bg-teal-50" : "border-gray-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectProvider(provider.id)}
                      aria-pressed={active}
                      className="w-full text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-gray-900">{provider.name}</span>
                        {provider.recommended && <span className="badge badge-teal">แนะนำ</span>}
                        {hasKey && (
                          <span className="text-xs font-medium text-teal-700">มี key แล้ว</span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-gray-700">{provider.summary}</span>
                    </button>
                    {active && (
                      <a
                        href={provider.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"
                      >
                        สร้าง API key ที่ {provider.maker}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* โมเดลจริง */}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <KeyRound className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
              โมเดลที่ใช้งานได้
              {modelState === "ok" && (
                <span className="badge badge-slate">{models.length}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => void loadModels(true)}
              disabled={!key.trim() || modelState === "loading"}
              className="btn btn-ghost h-8 px-2 text-xs"
            >
              {modelState === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              ตรวจใหม่
            </button>
          </div>

          {modelState === "loading" && (
            <p className="mt-2 text-xs text-gray-500">กำลังตรวจ key และดึงรายการโมเดล…</p>
          )}
          {modelState === "error" && (
            <p className="mt-2 flex items-start gap-1 text-xs text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
              {modelError}
            </p>
          )}
          {modelState === "idle" && !key.trim() && (
            <p className="mt-2 text-xs text-gray-500">ใส่ key ก่อน แล้วรายการโมเดลจะขึ้นเอง</p>
          )}
          {modelState === "ok" && models.length > 0 && (
            <p className="mt-2 text-[11px] text-gray-500">
              {visionCount > 0
                ? `อ่านรูปได้ ${visionCount} โมเดล`
                : "ไม่พบโมเดลที่อ่านรูปได้ — เลือกเจ้าอื่นหรือพิมพ์ชื่อโมเดลเอง"}
            </p>
          )}

          {modelState === "ok" && models.length > 0 && !useCustomModel ? (
            <select
              value={modelInList ? model : ""}
              onChange={(event) => setModelFor(settings.provider, event.target.value)}
              className="input mt-2 w-full font-mono text-sm"
              aria-label={`เลือกโมเดลของ ${info.name}`}
            >
              {!modelInList && (
                <option value="">
                  {model ? `เดิม: ${model} (ไม่พบในรายการ)` : "เลือกโมเดล"}
                </option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.vision ? " · อ่านรูปได้" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(event) => setModelFor(settings.provider, event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_MODELS[settings.provider]}
              className="input mt-2 w-full font-mono text-sm"
              aria-label="ชื่อโมเดล"
            />
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUseCustomModel((v) => !v)}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              {useCustomModel ? "เลือกจากรายการ" : "พิมพ์ชื่อโมเดลเอง"}
            </button>
            {modelState === "ok" && models.length === 0 && (
              <span className="text-[11px] text-gray-500">— key นี้ยังไม่เห็นโมเดลที่ใช้ได้</span>
            )}
          </div>
        </div>

        {/* ขนาดรูป */}
        <label className="mt-4 block text-xs font-medium text-gray-600">
          ขนาดรูปที่ส่งให้ AI
          <select
            value={settings.imageMaxSide}
            onChange={(event) => patch({ imageMaxSide: Number(event.target.value) as ImageMaxSide })}
            className="input mt-1 w-full"
          >
            {IMAGE_SIDES.map((side) => (
              <option key={side} value={side}>
                {side} px{" "}
                {side === 1280 ? "(เร็วสุด)" : side === 1600 ? "(แนะนำ)" : "(ละเอียดสุด ช้ากว่า)"}
              </option>
            ))}
          </select>
        </label>

        {/* ความเร็ว */}
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Gauge className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            ความเร็ว / การลองใหม่
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SPEED_PRESETS.map((preset) => {
              const active = speedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patch({ aiMaxAttempts: preset.attempts, aiTimeoutSec: preset.timeout })}
                  className={`rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
                    active
                      ? "border-teal-600 bg-teal-50 font-bold text-teal-900"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block">{preset.label}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                    {preset.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= อื่น ๆ ================= */}
      <section className="card mt-4 p-4 sm:p-5" aria-labelledby="other-group-title">
        <h2 id="other-group-title" className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
          ความเป็นส่วนตัวและอื่น ๆ
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
          <li>API key ไม่ถูกบันทึกในเว็บ เซิร์ฟเวอร์ หรือฐานข้อมูล — เก็บในหน่วยความจำของแท็บนี้เท่านั้น และส่งต่อให้ผู้ให้บริการ AI ครั้งต่อคำขอ</li>
          <li>ตอนสแกน รูปและ key จะส่งผ่านเซิร์ฟเวอร์ของแอปไปยังผู้ให้บริการ AI ที่เลือก เซิร์ฟเวอร์ไม่เก็บไว้</li>
          <li>รูปฉลากมีชื่อและที่อยู่ลูกค้า ตรวจเงื่อนไขการใช้ข้อมูลของผู้ให้บริการก่อนใช้งานจริง</li>
          <li>อย่าใช้ key ร่วมกับเครื่องสาธารณะ และตั้งวงเงินใช้จ่ายที่เว็บผู้ให้บริการไว้</li>
        </ul>
      </section>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} className="btn btn-primary flex-1">
          <Save className="h-4 w-4" aria-hidden="true" />
          บันทึก
        </button>
        <button type="button" onClick={clearKey} disabled={!key} className="btn btn-secondary">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          ล้าง key
        </button>
      </div>
    </div>
  );
}
