"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, Save, Settings, Sparkles, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  DEFAULT_MODELS,
  IMAGE_SIDES,
  PROVIDERS,
  defaultSettings,
  loadSettings,
  maskKey,
  saveSettings,
  type AiProvider,
  type AppSettings,
  type ImageMaxSide,
} from "@/lib/aiSettings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const info = PROVIDERS.find((p) => p.id === settings.provider) ?? PROVIDERS[0];
  const key = settings.apiKeys[settings.provider];
  const model = settings.models[settings.provider];

  const patch = (next: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...next }));

  const setKey = (value: string) =>
    setSettings((s) => ({ ...s, apiKeys: { ...s.apiKeys, [s.provider]: value } }));

  const setModel = (value: string) =>
    setSettings((s) => ({ ...s, models: { ...s.models, [s.provider]: value } }));

  const selectProvider = (id: AiProvider) => {
    setShowKey(false);
    patch({ provider: id });
  };

  const save = () => {
    if (settings.scanMode === "ai" && !key.trim()) {
      toast.error(`ใส่ API key ของ ${info.name} ก่อนเปิดโหมด AI`);
      return;
    }
    const next: AppSettings = {
      ...settings,
      apiKeys: { ...settings.apiKeys, [settings.provider]: key.trim() },
      models: { ...settings.models, [settings.provider]: model.trim() || DEFAULT_MODELS[settings.provider] },
    };
    if (saveSettings(next)) {
      setSettings(next);
      toast.success("บันทึกการตั้งค่าแล้ว");
    } else {
      toast.error("บันทึกไม่ได้ เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล");
    }
  };

  const clearKey = () => {
    setKey("");
    toast.success("ล้าง key แล้ว กดบันทึกเพื่อยืนยัน");
  };

  return (
    <div className="page-shell mx-auto max-w-xl px-4 py-6 pb-32 sm:py-8 md:pb-8">
      <div className="mb-5">
        <h1 className="page-title">
          <Settings className="h-7 w-7 text-teal-700" aria-hidden="true" />
          ตั้งค่า
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-600">
          เลือกวิธีอ่านฉลากพัสดุ และใส่ API key ของ AI ที่ต้องการใช้
        </p>
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Sparkles className="h-4 w-4 text-teal-700" aria-hidden="true" />
          วิธีอ่านฉลาก
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="วิธีอ่านฉลาก">
          {(
            [
              { id: "ocr", title: "OCR ในเครื่อง", desc: "ฟรี ไม่ต้องใช้ key แต่ภาษาไทยอาจอ่านผิดบ้าง" },
              { id: "ai", title: "ใช้ AI อ่านรูป", desc: "แม่นกว่า แยกชื่อ บ้านเลขที่ ที่อยู่ให้ ต้องมี API key" },
            ] as const
          ).map((m) => {
            const active = settings.scanMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => patch({ scanMode: m.id })}
                className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                  active ? "border-teal-600 bg-teal-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="block font-bold text-gray-900">{m.title}</span>
                <span className="mt-1 block text-xs text-gray-600">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card mt-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <KeyRound className="h-4 w-4 text-teal-700" aria-hidden="true" />
          ผู้ให้บริการ AI
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          เลือกเจ้าที่ต้องการ กดลิงก์เพื่อสมัครและสร้าง API key ราคาและโควตาอาจเปลี่ยน ตรวจที่เว็บผู้ให้บริการ
        </p>

        <ul className="mt-3 space-y-2">
          {PROVIDERS.map((p) => {
            const active = p.id === settings.provider;
            const hasKey = settings.apiKeys[p.id].trim().length > 0;
            return (
              <li key={p.id}>
                <div
                  className={`rounded-xl border p-3 ${
                    active ? "border-teal-600 bg-teal-50" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectProvider(p.id)}
                    aria-pressed={active}
                    className="w-full text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      {p.recommended && <span className="badge badge-teal">แนะนำ</span>}
                      {hasKey && <span className="text-xs font-medium text-teal-700">มี key แล้ว</span>}
                    </span>
                    <span className="mt-1 block text-xs text-gray-700">{p.summary}</span>
                    <span className="mt-1 block text-xs text-gray-500">{p.pricing}</span>
                  </button>
                  <a
                    href={p.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"
                  >
                    สมัคร / สร้าง API key ที่ {p.maker}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-gray-600">
            API key ของ {info.name}
            <div className="mt-1 flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={info.keyPrefix}
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
            {loaded && key && !showKey && (
              <span className="mt-1 block text-xs text-gray-500">บันทึกไว้: {maskKey(key)}</span>
            )}
          </label>

          <label className="block text-xs font-medium text-gray-600">
            โมเดล
            <input
              type="text"
              list="ai-model-options"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="input mt-1 w-full font-mono"
            />
            <datalist id="ai-model-options">
              {info.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <span className="mt-1 block text-xs text-gray-500">
              เลือกจากรายการหรือพิมพ์ชื่อโมเดลที่ผู้ให้บริการเปิดให้ใช้
            </span>
          </label>
        </div>
      </section>

      <section className="card mt-4 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">ตัวเลือกอื่น ๆ</h2>

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
              กรณี key ผิด เครดิตหมด หรือเน็ตมีปัญหา ระบบจะอ่านด้วย OCR ในเครื่องต่อ
            </span>
          </span>
        </label>

        <label className="mt-4 block text-xs font-medium text-gray-600">
          ขนาดรูปที่ส่งให้ AI
          <select
            value={settings.imageMaxSide}
            onChange={(event) => patch({ imageMaxSide: Number(event.target.value) as ImageMaxSide })}
            className="input mt-1 w-full"
          >
            {IMAGE_SIDES.map((s) => (
              <option key={s} value={s}>
                {s} px {s === 1600 ? "(แนะนำ)" : s < 1600 ? "(เร็ว ประหยัด)" : "(ละเอียดสุด ช้ากว่า)"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card mt-4 p-4 text-xs text-gray-600 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">ความเป็นส่วนตัว</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>API key เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล</li>
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
