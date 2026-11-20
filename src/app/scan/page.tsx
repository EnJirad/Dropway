"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Home,
  Loader2,
  MapPin,
  Navigation as NavigationIcon,
  Phone,
  PlusCircle,
  QrCode,
  RotateCcw,
  Search,
  AlertCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { House } from "@/types/house";

const SCANNER_REGION_ID = "qr-scan-region";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * แปลงข้อความที่สแกนได้เป็นรหัสค้นหา
 * รองรับ: UUID เปล่า ๆ, ลิงก์ที่มี ?id= / ?house_id= / ?uuid=,
 * ลิงก์ที่มี UUID อยู่ใน path, JSON ที่มี id/uuid และชื่อ/เบอร์/ที่อยู่ทั่วไป
 */
function extractLookup(raw: string): { id?: string; term?: string } {
  const text = raw.trim();
  if (!text) return {};

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        parsed.house_id ?? parsed.houseId ?? parsed.uuid ?? parsed.id ?? parsed.code;
      if (typeof candidate === "string" && candidate.trim()) {
        if (UUID_PATTERN.test(candidate.trim())) {
          return { id: candidate.trim().toLowerCase() };
        }
        return { term: candidate.trim() };
      }
    } catch {
      // ไม่ใช่ JSON — ใช้การค้นหาแบบข้อความด้านล่าง
    }
  }

  if (/^(https?:\/\/|dropway:\/\/)/i.test(text)) {
    try {
      const url = new URL(text);
      const fromQuery = [
        "house_id",
        "houseId",
        "house",
        "id",
        "uuid",
        "q",
        "code",
        "search",
      ]
        .map((key) => url.searchParams.get(key))
        .find((value): value is string => Boolean(value && value.trim()));

      if (fromQuery) {
        if (UUID_PATTERN.test(fromQuery.trim())) {
          return { id: fromQuery.trim().toLowerCase() };
        }
        return { term: fromQuery.trim() };
      }
    } catch {
      // URL ไม่ถูกต้อง — ตรวจ UUID จากข้อความทั้งก้อนต่อ
    }
  }

  const uuid = text.match(UUID_IN_TEXT)?.[0];
  if (uuid) return { id: uuid.toLowerCase() };

  return { term: text };
}

/**
 * ค้นหาบ้านจากสิ่งที่สแกนได้
 * 1) ถ้าเป็น UUID → หา id ตรง ๆ
 * 2) ถ้าไม่ใช่ → ค้นชื่อ / เบอร์ / ที่อยู่แบบมีคำนั้นอยู่
 */
async function findHouseByCode(raw: string): Promise<House | null> {
  const lookup = extractLookup(raw);

  // 1. ลองค้นหาผ่าน Neon API
  try {
    const q = lookup.id || lookup.term || "";
    if (q) {
      const res = await fetch(`/api/houses?search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
        if (lookup.id) {
          const match = json.data.find(
            (h: House) => h.id.toLowerCase() === lookup.id?.toLowerCase()
          );
          if (match) return match;
        } else {
          return json.data[0];
        }
      }
    }
  } catch {}

  if (lookup.id) {
    const { data, error } = await supabase
      .from("houses")
      .select("*")
      .eq("id", lookup.id)
      .maybeSingle();
    if (error) throw error;
    return (data as House | null) ?? null;
  }

  // ตัดอักขระที่ทำให้ PostgREST filter เพี้ยน
  const term = (lookup.term ?? "")
    .replace(/[\\,()*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (term.length < 2) return null;

  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("houses")
    .select("*")
    .or(
      `full_name.ilike.${pattern},phone.ilike.${pattern},address.ilike.${pattern}`,
    )
    .limit(1);
  if (error) throw error;
  return (data?.[0] as House | undefined) ?? null;
}

function cameraErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/permission|notallowed|denied|blocked/i.test(message)) {
    return "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองอีกครั้ง หรือใช้ช่องกรอกรหัสด้านล่าง";
  }
  if (/notfound|no camera|devicesnotfound|overconstrained/i.test(message)) {
    return "ไม่พบกล้องบนอุปกรณ์นี้ — ใช้ช่องกรอกรหัสด้านล่างแทนได้";
  }
  if (/secure|https|not supported/i.test(message)) {
    return "กล้องต้องใช้งานผ่าน HTTPS — เปิดเว็บด้วยที่อยู่ https:// แล้วลองอีกครั้ง";
  }
  return "เปิดกล้องไม่สำเร็จ — ลองใหม่อีกครั้ง หรือใช้ช่องกรอกรหัสด้านล่าง";
}

export default function ScanPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const startingRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<House | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lastCode, setLastCode] = useState("");

  const [manualCode, setManualCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // กล้องอาจถูกหยุดไปแล้ว — ไม่ต้องแจ้ง error
    }
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }, []);

  // ปิดกล้องเมื่อออกจากหน้า
  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const handleDecoded = useCallback(async (text: string) => {
    if (handlingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    handlingRef.current = true;
    try {
      // พักภาพหลังอ่านได้ครั้งแรก กันการสแกนซ้ำรัว ๆ
      try {
        scannerRef.current?.pause(true);
      } catch {
        // ignore
      }

      setLastCode(trimmed);
      setResult(null);
      setNotFound(false);
      setAdded(false);
      setLooking(true);

      const house = await findHouseByCode(trimmed);
      if (house) {
        setResult(house);
        toast.success("พบบ้านแล้ว");
      } else {
        setNotFound(true);
        toast.error("ไม่พบข้อมูลบ้านจากรหัสนี้");
      }
    } catch (error) {
      console.error(error);
      toast.error(
        "ค้นหาไม่สำเร็จ: " + (error instanceof Error ? error.message : ""),
      );
      setNotFound(true);
    } finally {
      setLooking(false);
      handlingRef.current = false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current || scanning) return;
    startingRef.current = true;
    setStarting(true);
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_REGION_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          aspectRatio: 1,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const edge = Math.floor(
              Math.min(viewfinderWidth, viewfinderHeight) * 0.72,
            );
            return { width: edge, height: edge };
          },
        },
        (decodedText) => {
          void handleDecoded(decodedText);
        },
        () => {
          // ไม่ต้องแจ้ง error ทุกเฟรมที่ยังไม่พบรหัส
        },
      );
      setScanning(true);
    } catch (error) {
      console.error(error);
      setCameraError(cameraErrorMessage(error));
      scannerRef.current = null;
      setScanning(false);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [handleDecoded, scanning]);

  const scanAgain = useCallback(async () => {
    setResult(null);
    setNotFound(false);
    setLastCode("");
    setAdded(false);

    const scanner = scannerRef.current;
    if (scanner) {
      try {
        scanner.resume();
        return;
      } catch {
        // ถ้า resume ไม่ได้ ให้เริ่มใหม่ด้านล่าง
      }
    }
    await stopScanner();
    await startScanner();
  }, [startScanner, stopScanner]);

  const addToNavigation = useCallback(
    async (silent = false) => {
      if (!result || adding) return;
      setAdding(true);
      try {
        let addedViaNeon = false;
        let isDuplicate = false;
        try {
          const res = await fetch("/api/navigation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ house_id: result.id }),
          });
          if (res.ok) {
            addedViaNeon = true;
          }
        } catch {}

        if (!addedViaNeon) {
          const { error } = await supabase
            .from("user_navigation_houses")
            .insert({ house_id: result.id });

          if (error && error.code !== "23505") throw error;
          if (error?.code === "23505") isDuplicate = true;
        }

        setAdded(true);
        if (!silent) {
          toast.success(
            isDuplicate
              ? "บ้านนี้อยู่ในรายการนำทางแล้ว"
              : "เพิ่มเข้าคิวนำทางแล้ว",
          );
        }
      } catch (error) {
        console.error(error);
        toast.error("เพิ่มเข้าคิวนำทางไม่สำเร็จ");
      } finally {
        setAdding(false);
      }
    },
    [adding, result],
  );

  const hasCoords = result?.lat != null && result?.lng != null;

  const navigateNow = useCallback(async () => {
    if (!result) return;
    if (result.lat == null || result.lng == null) {
      toast.error("บ้านนี้ยังไม่มีพิกัด — เพิ่มพิกัดในหน้าคลังบ้านก่อน");
      return;
    }
    await addToNavigation(true);
    window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${result.lat},${result.lng}&travelmode=driving`;
  }, [addToNavigation, result]);

  const searchManual = useCallback(async () => {
    const code = manualCode.trim();
    if (!code) {
      toast.error("กรอกหรือวางรหัสก่อนค้นหา");
      return;
    }
    setLooking(true);
    setResult(null);
    setNotFound(false);
    setAdded(false);
    setLastCode(code);
    try {
      const house = await findHouseByCode(code);
      if (house) {
        setResult(house);
        toast.success("พบบ้านแล้ว");
      } else {
        setNotFound(true);
        toast.error("ไม่พบข้อมูลบ้านจากรหัสนี้");
      }
    } catch (error) {
      console.error(error);
      setNotFound(true);
      toast.error("ค้นหาไม่สำเร็จ");
    } finally {
      setLooking(false);
    }
  }, [manualCode]);

  const searchHref = result
    ? `/houses?search=${encodeURIComponent(
        result.full_name ?? result.phone ?? result.address ?? "",
      )}`
    : "/houses";

  return (
    <div className="page-shell mx-auto max-w-xl px-4 py-6 pb-32 sm:py-8 md:pb-8">
      <div className="mb-5">
        <h1 className="page-title">
          <QrCode className="h-7 w-7 text-teal-700" aria-hidden="true" />
          สแกน QR / บาร์โค้ด
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-600">
          สแกนรหัสบนบ้านหรือกล่องเพื่อหาชื่อ เบอร์ ที่อยู่ แล้วนำทางได้ทันที
        </p>
      </div>

      <section className="card overflow-hidden">
        <div className="relative aspect-square w-full bg-slate-900">
          <div
            id={SCANNER_REGION_ID}
            className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
          />

          {!scanning && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/80">
              <QrCode className="h-12 w-12" aria-hidden="true" />
              <p className="text-sm font-medium">
                {starting ? "กำลังเปิดกล้อง..." : "กดปุ่มด้านล่างเพื่อเปิดกล้องสแกน"}
              </p>
            </div>
          )}

          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
              <Loader2
                className="h-9 w-9 animate-spin text-white"
                aria-label="กำลังเปิดกล้อง"
              />
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            {scanning ? (
              <button
                type="button"
                onClick={() => void stopScanner()}
                className="btn btn-secondary flex-1"
              >
                <CameraOff className="h-4 w-4" aria-hidden="true" />
                หยุดกล้อง
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startScanner()}
                disabled={starting}
                className="btn btn-primary flex-1"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                {starting ? "กำลังเปิดกล้อง..." : "เปิดกล้องสแกน"}
              </button>
            )}
            {(result || notFound) && (
              <button
                type="button"
                onClick={() => void scanAgain()}
                className="btn btn-secondary flex-1"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                สแกนอีกครั้ง
              </button>
            )}
          </div>

          {cameraError && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span>{cameraError}</span>
            </div>
          )}

          {looking && (
            <p
              aria-live="polite"
              className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-600"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              กำลังค้นหาบ้าน...
            </p>
          )}

          {lastCode && !looking && (
            <p className="mt-3 break-all text-xs text-gray-500">
              รหัสที่อ่านได้: <span className="font-mono">{lastCode}</span>
            </p>
          )}
        </div>
      </section>

      {result && (
        <section className="card mt-4 p-4 sm:p-5" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                พบบ้านในคลัง
              </p>
              <h2 className="mt-0.5 break-words text-xl font-bold text-gray-900">
                {result.full_name || "ไม่มีชื่อ"}
              </h2>
            </div>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {result.phone && (
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
                <div>
                  <dt className="sr-only">เบอร์โทร</dt>
                  <dd>
                    <a
                      href={`tel:${result.phone}`}
                      className="font-medium text-teal-700 underline-offset-2 hover:underline"
                    >
                      {result.phone}
                    </a>
                  </dd>
                </div>
              </div>
            )}
            {result.address && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
                <div>
                  <dt className="sr-only">ที่อยู่</dt>
                  <dd className="text-gray-700">{result.address}</dd>
                </div>
              </div>
            )}
            {result.note && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">
                <dt className="sr-only">หมายเหตุ</dt>
                <dd>{result.note}</dd>
              </div>
            )}
            {!hasCoords && (
              <p className="text-xs font-medium text-amber-700">
                บ้านนี้ยังไม่มีพิกัด — นำทางด้วย Google Maps ไม่ได้
              </p>
            )}
          </dl>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void navigateNow()}
              disabled={!hasCoords}
              className="btn btn-primary"
            >
              <NavigationIcon className="h-4 w-4" aria-hidden="true" />
              นำทางทันที
            </button>
            <button
              type="button"
              onClick={() => void addToNavigation()}
              disabled={adding || added}
              className="btn btn-secondary"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              {added ? "อยู่ในคิวนำทางแล้ว" : adding ? "กำลังเพิ่ม..." : "เพิ่มในรายการนำทาง"}
            </button>
            <Link
              href={searchHref}
              className="btn btn-secondary sm:col-span-2"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              เปิดในคลังบ้าน
            </Link>
          </div>
        </section>
      )}

      {notFound && !looking && (
        <section className="card mt-4 p-4 sm:p-5" aria-live="polite">
          <div className="flex items-start gap-2 text-amber-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
            <div>
              <h2 className="font-bold">ไม่พบบ้านจากรหัสนี้</h2>
              <p className="mt-1 text-sm">
                ตรวจสอบว่า QR เป็นของบ้านในคลังนี้ หรือลองสแกนอีกครั้ง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void scanAgain()}
            className="btn btn-secondary mt-4 w-full"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            สแกนอีกครั้ง
          </button>
        </section>
      )}

      <section className="card mt-4 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">กรอกรหัสเอง</h2>
        <p className="mt-1 text-xs text-gray-500">
          ใช้เมื่อกล้องใช้ไม่ได้ — วาง UUID ของบ้าน หรือชื่อ / เบอร์ / ที่อยู่
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="manual-code" className="sr-only">
            รหัสบ้าน
          </label>
          <input
            id="manual-code"
            type="text"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchManual();
            }}
            placeholder="UUID หรือชื่อบ้าน"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => void searchManual()}
            disabled={looking}
            className="btn btn-primary"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            ค้นหา
          </button>
        </div>
      </section>
    </div>
  );
}
