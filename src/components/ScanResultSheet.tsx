"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Edit3,
  Loader2,
  MapPin,
  Navigation as NavigationIcon,
  Phone,
  PlusCircle,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import type { House } from "@/types/house";
import type { HouseMatch } from "@/lib/parcelMatch";
import { composeAddress, type LabelFields } from "@/lib/labelParse";
import { emptyFields, type ScanNotice } from "@/lib/scanMerge";

const FORM_FIELDS: { key: keyof LabelFields; label: string }[] = [
  { key: "name", label: "ชื่อผู้รับ" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "houseNo", label: "บ้านเลขที่" },
  { key: "address", label: "ที่อยู่" },
  { key: "postalCode", label: "รหัสไปรษณีย์" },
  { key: "tracking", label: "เลขพัสดุ" },
];

/** ผลหลักที่แสดงบนสุดของ popup (บ้านในคลัง หรือข้อมูลที่อ่านได้จากฉลาก) */
export type ScanPrimary = {
  house: House | null;
  match: HouseMatch | null;
};

type Props = {
  open: boolean;
  primary: ScanPrimary | null;
  draft: LabelFields;
  candidates: HouseMatch[];
  tracking: string | null;
  notice: ScanNotice | null;
  /** เลขพัสดุนี้อยู่ในคิวแล้ว = พัสดุชิ้นเดียวกัน เพิ่มซ้ำไม่ได้ */
  sameParcel: {
    tracking_number: string | null;
    full_name: string | null;
    created_at: string;
    delivery_status: string | null;
  } | null;
  /** กำลังเพิ่มเข้าคิว/บันทึกอยู่ */
  busy: boolean;
  added: boolean;
  onClose: () => void;
  onAdd: (form: LabelFields) => Promise<boolean>;
  onSave: (form: LabelFields, note: string) => Promise<boolean>;
  onSelectCandidate: (match: HouseMatch) => void;
  /** ค้นหาบ้านจากข้อความอิสระ (ใช้ช่องค้นหาในชีต) */
  onSearch: (query: string) => Promise<HouseMatch[]>;
  onScanAgain: () => void;
};

/** แปลงบ้านในคลังเป็นช่องข้อมูลที่แก้ไขได้ (บ้านเลขที่/รหัสไปรษณีย์แยกจากที่อยู่) */
function fieldsFromHouse(house: House, tracking: string | null): LabelFields {
  const address = (house.address ?? "").trim();
  const houseNoMatch = address.match(/^\s*(\d{1,5}(?:\/\d{1,4})?)/);
  const postalMatches = address.match(/(?:^|\D)([1-9]\d{4})(?!\d)/g) ?? [];
  const lastPostal = postalMatches.length
    ? (postalMatches[postalMatches.length - 1].replace(/\D/g, "") ?? "")
    : "";
  return {
    name: house.full_name ?? "",
    phone: house.phone ?? "",
    houseNo: houseNoMatch ? houseNoMatch[1] : "",
    address,
    postalCode: lastPostal,
    tracking: tracking ?? "",
  };
}

function fieldsFromDraft(draft: LabelFields, tracking: string | null): LabelFields {
  return {
    name: draft.name,
    phone: draft.phone,
    houseNo: draft.houseNo,
    address: draft.address,
    postalCode: draft.postalCode,
    tracking: draft.tracking || tracking || "",
  };
}

const LEVEL_LABEL: Record<HouseMatch["level"], string> = {
  exact: "ตรงมาก",
  high: "ใกล้เคียงสูง",
  medium: "อาจใช่",
};

export default function ScanResultSheet({
  open,
  primary,
  draft,
  candidates,
  tracking,
  notice,
  sameParcel,
  busy,
  added,
  onClose,
  onAdd,
  onSave,
  onSelectCandidate,
  onSearch,
  onScanAgain,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LabelFields>(emptyFields());
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HouseMatch[] | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const house = primary?.house ?? null;
  const match = primary?.match ?? null;

  // ตั้งฟอร์มใหม่ทุกครั้งที่ผลหลักเปลี่ยน (สแกนใหม่ หรือแตะบ้านแนะนำ)
  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setForm(house ? fieldsFromHouse(house, tracking) : fieldsFromDraft(draft, tracking));
    setNote(house?.note ?? "");
  }, [open, house, draft, tracking]);

  // โฟกัสในชีตเพื่อให้ Escape/คีย์บอร์ดทำงานกับ dialog ไม่ใช่หน้าเบื้องหลัง
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => sheetRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  // ปิดชีตแล้วล้างคำค้นหา ไม่ให้ค้างมาทับผลสแกนครั้งถัดไป
  useEffect(() => {
    if (open) return;
    setQuery("");
    setSearchResults(null);
    setSearching(false);
  }, [open]);

  // ค้นหาบ้านจากคำที่พิมพ์ (debounce 350ms — ลดจำนวน request)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void onSearch(q)
        .then((found) => {
          if (!cancelled) setSearchResults(found);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, onSearch]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !saving) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, saving, onClose]);

  const addressPreview = useMemo(() => composeAddress(form), [form]);
  const canSave = useMemo(
    () => Boolean(form.name.trim() || form.phone.trim() || addressPreview.trim()),
    [form, addressPreview],
  );

  if (!open) return null;

  const patch = (key: keyof LabelFields, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (saving || busy) return;
    if (!canSave) return;
    setSaving(true);
    try {
      const ok = await onSave(form, note);
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (saving || busy) return;
    await onAdd(form);
  };

  return (
    <div className="modal-overlay flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-sheet-title"
        className="modal-sheet scan-sheet w-full max-w-xl focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="scan-sheet-header">
          <span className="scan-sheet-grabber" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="scan-sheet-title" className="text-base font-bold text-gray-900">
                {house ? "พบบ้านในคลัง" : "ไม่พบในคลัง"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {house
                  ? "ตรวจข้อมูลให้ถูกต้อง แล้วเลือกเพิ่มเข้านำทางหรือบันทึก"
                  : "ตรวจข้อมูลที่อ่านได้จากฉลาก แล้วบันทึกเป็นบ้านใหม่ได้เลย"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างผลสแกน"
              className="btn btn-ghost -mr-1 -mt-1 h-9 w-9 flex-none p-0"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="scan-sheet-body" data-modal-scroll>
          {sameParcel ? (
            <div
              role="status"
              className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span>
                <span className="block font-bold">พัสดุชิ้นนี้อยู่ในคิวแล้ว</span>
                <span className="mt-0.5 block leading-relaxed">
                  เลขพัสดุ {sameParcel.tracking_number ?? tracking ?? ""} ถูกสแกนแล้ว
                  {sameParcel.full_name ? ` (${sameParcel.full_name})` : ""} —
                  เลขเดียวกันคือชิ้นเดียวกัน จึงเพิ่มเข้าคิวนำทางซ้ำไม่ได้
                </span>
              </span>
            </div>
          ) : null}

          {notice ? (
            <div
              role="status"
              className={`mb-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${
                notice.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span>{notice.text}</span>
            </div>
          ) : null}

          {/* ผลหลัก: อยู่บนสุดเสมอ */}
          <section
            aria-label={house ? "บ้านที่ตรงกับคลัง" : "ข้อมูลจากฉลาก"}
            className={`scan-primary ${house ? "scan-primary-hit" : "scan-primary-miss"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {house ? (
                <span className="badge badge-success">
                  <Database className="mr-1 h-3 w-3" aria-hidden="true" />
                  ตรงกับฐานข้อมูล
                </span>
              ) : (
                <span className="badge badge-amber">
                  <ScanLine className="mr-1 h-3 w-3" aria-hidden="true" />
                  ข้อมูลจากฉลาก
                </span>
              )}
              {match ? (
                <span className="badge badge-slate">{LEVEL_LABEL[match.level]}</span>
              ) : null}
              {match && match.reasons.length > 0 ? (
                <span className="text-[11px] text-gray-500">{match.reasons.join(" • ")}</span>
              ) : null}
            </div>

            {editing ? (
              <div className="mt-3 space-y-2">
                {FORM_FIELDS.map(({ key, label }) => (
                  <label key={key} className="block text-xs font-medium text-gray-600">
                    {label}
                    <input
                      type="text"
                      value={form[key]}
                      onChange={(event) => patch(key, event.target.value)}
                      inputMode={key === "phone" || key === "postalCode" ? "numeric" : "text"}
                      className="input mt-1 w-full"
                    />
                  </label>
                ))}
                <label className="block text-xs font-medium text-gray-600">
                  หมายเหตุ
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    placeholder="เช่น บ้านหลังที่ 2 ทางซ้าย / โทรก่อนถึง"
                    className="input mt-1 w-full"
                  />
                </label>
                <p className="text-[11px] text-gray-500">
                  แก้ไขแล้วกด “บันทึก” เพื่อบันทึกทับข้อมูล{house ? "บ้านหลังนี้" : "เป็นบ้านใหม่"}
                </p>              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                <p className="text-lg font-bold leading-tight text-gray-900">
                  {form.name.trim() || "ไม่ทราบชื่อผู้รับ"}
                </p>
                {form.phone ? (
                  <a href={`tel:${form.phone}`} className="scan-row">
                    <Phone className="h-4 w-4 flex-none text-teal-700" aria-hidden="true" />
                    <span className="font-mono">{form.phone}</span>
                  </a>
                ) : null}
                {addressPreview ? (
                  <p className="scan-row items-start">
                    <MapPin className="mt-0.5 h-4 w-4 flex-none text-teal-700" aria-hidden="true" />
                    <span>{addressPreview}</span>
                  </p>
                ) : null}
                {form.tracking ? (
                  <p className="scan-row">
                    <NavigationIcon className="h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
                    <span className="font-mono text-xs text-gray-600">{form.tracking}</span>
                  </p>
                ) : null}
                {note.trim() ? (
                  <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <StickyNote className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold">หมายเหตุ</span>
                      <span className="mt-0.5 block whitespace-pre-line leading-relaxed">
                        {note.trim()}
                      </span>
                    </span>
                  </div>
                ) : null}
                {match && match.conflicts.length > 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">{match.conflicts.join(" • ")}</p>
                ) : null}
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {/* ซ้าย: บันทึก */}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy || saving || !canSave}
                className="btn btn-secondary gap-1 px-2 text-xs sm:text-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : editing ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="truncate">{editing ? "บันทึกแก้ไข" : "บันทึก"}</span>
              </button>

              {/* กลาง: แก้ไข */}
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                disabled={busy || saving}
                className="btn btn-secondary gap-1 px-2 text-xs sm:text-sm"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{editing ? "ยกเลิก" : "แก้ไข"}</span>
              </button>

              {/* ขวา: เพิ่ม (เพิ่มเสร็จปิดหน้าทันที) */}
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={busy || saving || added || Boolean(sameParcel)}
                aria-label="เพิ่มเข้านำทางวันนี้"
                className="btn btn-primary gap-1 px-2 text-xs sm:text-sm"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="truncate">
                  {sameParcel ? "ชิ้นเดียวกัน" : added ? "เพิ่มแล้ว" : "เพิ่ม"}
                </span>
              </button>
            </div>

            {added ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-teal-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                เพิ่มเข้าคิวนำทางวันนี้แล้ว
              </p>
            ) : null}
          </section>

          {/* ค้นหาบ้านเอง — ใช้เมื่อผลสแกนไม่ตรงกับที่ต้องการ */}
          <section className="mt-5" aria-label="ค้นหาบ้านในคลัง">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              ค้นหาบ้านเอง
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ชื่อ / เบอร์ / ที่อยู่ / เลขพัสดุ"
                aria-label="ค้นหาบ้านในคลัง"
                className="input min-w-0 flex-1 text-sm"
              />
              {searching && (
                <Loader2 className="h-4 w-4 flex-none animate-spin text-gray-400" aria-hidden="true" />
              )}
            </div>
            {searchResults && searchResults.length === 0 && !searching && (
              <p className="mt-2 rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                ไม่พบบ้านที่ตรงกับ “{query.trim()}”
              </p>
            )}
            {searchResults && searchResults.length > 0 && (
              <ul className="mt-2 space-y-2">
                {searchResults.slice(0, 8).map((candidate) => (
                  <li key={candidate.house.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCandidate(candidate);
                        setQuery("");
                        setSearchResults(null);
                      }}
                      disabled={busy || saving}
                      className="scan-candidate"
                    >
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {candidate.house.full_name || "ไม่ทราบชื่อ"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          {candidate.house.phone ? `${candidate.house.phone} • ` : ""}
                          {candidate.house.address || "ไม่มีที่อยู่"}
                        </span>
                        {candidate.house.note ? (
                          <span className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700">
                            <StickyNote className="mt-0.5 h-3 w-3 flex-none" aria-hidden="true" />
                            <span className="line-clamp-2">{candidate.house.note}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="badge badge-slate">{LEVEL_LABEL[candidate.level]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* รายการแนะนำ: อยู่ล่างผลหลักเสมอ */}
          <section className="mt-5" aria-label="บ้านใกล้เคียงที่ระบบแนะนำ">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              บ้านใกล้เคียง / แนะนำ
              {candidates.length > 0 ? ` (${candidates.length})` : ""}
            </h3>

            {candidates.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                ไม่พบบ้านหลังอื่นที่ใกล้เคียง — ใช้ข้อมูลด้านบนได้เลย
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {candidates.map((candidate) => (
                  <li key={candidate.house.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(candidate)}
                      disabled={busy || saving}
                      className="scan-candidate"
                    >
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {candidate.house.full_name || "ไม่ทราบชื่อ"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          {candidate.house.phone ? `${candidate.house.phone} • ` : ""}
                          {candidate.house.address || "ไม่มีที่อยู่"}
                        </span>
                        {candidate.house.note ? (
                          <span className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700">
                            <StickyNote className="mt-0.5 h-3 w-3 flex-none" aria-hidden="true" />
                            <span className="line-clamp-2">{candidate.house.note}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        <span className="badge badge-slate">{LEVEL_LABEL[candidate.level]}</span>
                        <span className="text-[11px] text-gray-400">แตะเพื่อเลือก</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            onClick={onScanAgain}
            disabled={busy || saving}
            className="btn btn-secondary mt-5 w-full"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            สแกนอีกครั้ง
          </button>
        </div>
      </div>
    </div>
  );
}
