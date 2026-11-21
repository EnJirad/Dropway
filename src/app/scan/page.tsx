"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Loader2,
  ScanText,
  Search,
  Zap,
  ZapOff,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { House } from "@/types/house";
import { extractTracking, type HouseMatch } from "@/lib/parcelMatch";
import { composeAddress, type LabelFields } from "@/lib/labelParse";
import { isAiReady, loadSettings } from "@/lib/aiSettings";
import { hasServerAiKey, readLabelWithAi } from "@/lib/aiScan";
import { disposeOcr, recognizeLabel, warmupOcr } from "@/lib/ocr";
import {
  ANALYSIS_MAX_SIDE,
  analyzeCanvas,
  frameDifference,
  looksLikeLabel,
  looksTooClose,
} from "@/lib/labelDetect";
import { beepCapture, unlockBeep } from "@/lib/beep";
import { useModalKeyboardBehavior } from "@/lib/viewport";
import BlockingLoader from "@/components/BlockingLoader";
import ScanResultSheet, { type ScanPrimary } from "@/components/ScanResultSheet";
import {
  buildScanOutcome,
  describeScanStatus,
  emptyFields,
  hasAnyField,
  type AiInput,
  type ScanNotice,
} from "@/lib/scanMerge";

const SCANNER_REGION_ID = "qr-scan-region";
/** ต้องเห็นใบปะหน้านิ่งต่อเนื่องกี่ ms ก่อนถ่ายเอง (ลดลงเพื่อความไว — ยังมีเกณฑ์ความคมชัดกันภาพเบลอ) */
const AUTO_HOLD_MS = 900;
/** ตรวจจับนิ่งต่อเนื่องกี่ ms พร้อมกับ hold */
const AUTO_STILL_MS = 500;
/** ตรวจเฟรมทุกกี่ ms */
const AUTO_TICK_MS = 250;
/** หลังเพิ่มสำเร็จ เว้นช่วงก่อนสแกนชิ้นถัดไป กันสแกนซ้ำใบเดิม */
const AUTO_COOLDOWN_MS = 1800;
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

  // ค้นหาผ่าน Neon API
  try {
    if (lookup.id) {
      const res = await fetch(`/api/houses?id=${encodeURIComponent(lookup.id)}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
        return json.data[0];
      }
    }
    const q = lookup.term || lookup.id || "";
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
  } catch (err) {
    console.error("Lookup error:", err);
  }

  return null;
}

type SameParcelMeta = {
  nav_id: string;
  tracking_number: string | null;
  created_at: string;
  house_id: string | null;
  delivery_status: string | null;
  full_name: string | null;
  address: string | null;
};

type IdentifyResult = {
  house: House | null;
  candidates: HouseMatch[];
  tracking: string | null;
  /** ข้อมูลการจับคู่ของผลหลัก (ใช้แสดงเหตุผลบนการ์ด) */
  match: HouseMatch | null;
  /** มีเลขพัสดุนี้ในคิวแล้ว = พัสดุชิ้นเดียวกัน เพิ่มซ้ำไม่ได้ */
  sameParcel: SameParcelMeta | null;
};

/**
 * ระบุบ้านจากข้อความที่สแกน/อ่านจากฉลาก
 * UUID → ค้น id ตรง ๆ, นอกนั้นส่งไปเทียบชื่อ + บ้านเลขที่ + เบอร์ + เลขพัสดุที่เคยบันทึก
 */
async function identify(raw: string): Promise<IdentifyResult> {
  const text = raw.trim();
  const tracking = extractTracking(text);

  if (UUID_IN_TEXT.test(text)) {
    const house = await findHouseByCode(text);
    if (house) return { house, candidates: [], tracking: null, match: null, sameParcel: null };
  }

  let candidates: HouseMatch[] = [];
  let sameParcel: SameParcelMeta | null = null;
  try {
    const res = await fetch("/api/houses/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const json = await res.json();
    if (Array.isArray(json.candidates)) candidates = json.candidates;
    if (json.existing_parcel && typeof json.existing_parcel === "object") {
      sameParcel = json.existing_parcel as SameParcelMeta;
    }
  } catch (err) {
    console.error("Match error:", err);
  }

  const top = candidates[0];
  if (top && (top.level === "exact" || top.level === "high")) {
    return {
      house: top.house,
      candidates: candidates.slice(1),
      tracking,
      match: top,
      sameParcel,
    };
  }

  if (candidates.length === 0 && text.length <= 80 && !text.includes("\n")) {
    const house = await findHouseByCode(text);
    if (house) return { house, candidates: [], tracking, match: null, sameParcel };
  }

  return { house: null, candidates, tracking, match: null, sameParcel };
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
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /** กำลังทำงานอยู่ (อ่านฉลาก/ค้นหา) — ใช้เปิดตัวโหลดที่บล็อกทั้งจอ */
  const [loading, setLoading] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState("กำลังอ่านฉลาก");
  const [stage, setStage] = useState<string | null>(null);

  const [result, setResult] = useState<House | null>(null);
  const [primaryMatch, setPrimaryMatch] = useState<HouseMatch | null>(null);
  const [candidates, setCandidates] = useState<HouseMatch[]>([]);
  const [tracking, setTracking] = useState<string | null>(null);
  /** มีเลขพัสดุนี้ในคิวแล้ว (พัสดุชิ้นเดียวกัน) */
  const [sameParcel, setSameParcel] = useState<SameParcelMeta | null>(null);
  const [draft, setDraft] = useState<LabelFields>(emptyFields());
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [manualCode, setManualCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [lastCode, setLastCode] = useState("");

  /** สถานะการตรวจจับใบปะหน้าจากกล้องสด */
  const [autoStatus, setAutoStatus] = useState<
    "idle" | "searching" | "holding" | "capturing" | "stepback"
  >("idle");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const cooldownRef = useRef(0);
  /** เวลาที่ใช้ในรอบสแกนล่าสุด (ms) — ใช้ยืนยันความไวจริง */
  const [lastMs, setLastMs] = useState<number | null>(null);

  useModalKeyboardBehavior();

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
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

  // อุ่น OCR ล่วงหน้าเพื่อให้สแกนครั้งแรกเร็ว แล้วปิด worker ตอนออกจากหน้า
  useEffect(() => {
    const settings = loadSettings();
    if (settings.scanMode === "ocr" || settings.fallbackToOcr) warmupOcr();
    // อุ่นการเชื่อมต่อฐานข้อมูล + คีย์เข้ารหัสล่วงหน้า ลดเวลารอบแรก
    void fetch("/api/settings/ai", { cache: "no-store" }).catch(() => undefined);
    return () => {
      void disposeOcr();
    };
  }, []);

  // ปิดกล้องเมื่อออกจากหน้า
  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const applyIdentify = useCallback(async (text: string): Promise<boolean> => {
    const found = await identify(text);
    setTracking(found.tracking);
    setCandidates(found.candidates);
    setResult(found.house);
    setPrimaryMatch(found.match);
    setSameParcel(found.sameParcel);
    setAdded(false);
    return Boolean(found.house);
  }, []);

  // ถ่ายรูปฉลากพัสดุ → AI และ OCR อ่านพร้อมกัน → เทียบกับคลังบ้าน
  const scanPhoto = useCallback(
    async (file: File, options: { auto?: boolean; fast?: boolean } = {}) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      const startedAt = Date.now();
      setLoading(true);
      setLoadingTitle("กำลังอ่านฉลาก");
      setStage("กำลังเตรียมรูป…");
      setSheetOpen(false);
      setDraft(emptyFields());
      setNotice(null);
      setResult(null);
      setPrimaryMatch(null);
      setCandidates([]);
      setTracking(null);
      setSameParcel(null);
      setAdded(false);
      setLastCode("");

      try {
        const settings = loadSettings();
        // key ในหน่วยความจำอาจหายหลังรีเฟรช แต่ถ้าบันทึกไว้ในฐานข้อมูลแล้วยังใช้ได้
        let useAi = isAiReady(settings);
        if (!useAi && settings.scanMode === "ai") useAi = await hasServerAiKey();
        // OCR ในเครื่องทำงานคู่ขนานได้ เพราะใช้ CPU ขณะที่ AI รอเน็ต — เวลารวมจึงเท่าตัวที่ช้าสุด
        const runOcr = !useAi || settings.fallbackToOcr;

        if (useAi) {
          setStage(
            runOcr
              ? "กำลังอ่านฉลากด้วย AI และ OCR พร้อมกัน…"
              : "กำลังอ่านฉลากด้วย AI…",
          );
        } else {
          setStage("กำลังอ่านฉลากด้วย OCR ในเครื่อง…");
        }

        // เริ่ม OCR ไว้ก่อน (ทำงานคู่ขนานกับ AI) แต่ถ้า AI อ่านได้ครบก็ไม่ต้องรอ OCR
        const ocrPromise = runOcr ? recognizeLabel(file) : null;
        const aiResult = useAi
          ? await readLabelWithAi(file, settings, { fast: options.fast === true })
          : null;
        const aiOk = Boolean(aiResult && aiResult.ok && hasAnyField(aiResult.fields));

        let ocrAttempt: Awaited<ReturnType<typeof recognizeLabel>> | null = null;
        if (ocrPromise) {
          if (aiOk) {
            // AI ได้ข้อมูลแล้ว → คืนผลทันที ไม่รอ OCR (worker ยังอุ่นไว้ใช้ครั้งถัดไป)
            void ocrPromise;
          } else if (useAi) {
            setStage("AI อ่านได้ไม่ครบ — กำลังอ่านซ้ำด้วย OCR ในเครื่อง…");
            ocrAttempt = await ocrPromise;
          } else {
            ocrAttempt = await ocrPromise;
          }
        }

        const ai: AiInput = aiResult
          ? aiResult.ok
            ? { ok: true, fields: aiResult.fields, confidence: aiResult.confidence }
            : { ok: false, message: aiResult.message }
          : null;

        const outcome = buildScanOutcome({
          ocrText: ocrAttempt && ocrAttempt.ok ? ocrAttempt.text : "",
          ocrFailed: Boolean(ocrAttempt && !ocrAttempt.ok),
          ocrSkipped: !runOcr || aiOk,
          ai,
        });

        setNotice(describeScanStatus(outcome));
        setDraft(outcome.fields);

        if (!outcome.text.trim()) {
          setLoading(false);
          setStage(null);
          if (options.auto) {
            // โหมดอัตโนมัติ: อย่าเปิดชีตด้วยข้อมูลว่าง ให้จ่อใหม่แล้วสแกนต่อ
            setAutoStatus("searching");
            cooldownRef.current = Date.now() + AUTO_COOLDOWN_MS;
            toast.error("ยังอ่านไม่เจอ — จ่อใบปะหน้าให้ชิดขึ้นแล้วถือไว้อีกนิด");
            return;
          }
          setSheetOpen(true);
          toast.error("อ่านข้อมูลจากรูปไม่ได้ — กรอกเองในหน้าต่างผลสแกน");
          return;
        }

        setLastCode(outcome.text.replace(/\s+/g, " ").trim().slice(0, 200));
        setStage("กำลังเทียบกับคลังบ้าน…");
        const found = await applyIdentify(outcome.text);

        setLoading(false);
        setStage(null);
        setSheetOpen(true);
        if (found) toast.success("พบบ้านแล้ว");
        else toast.error("ไม่พบบ้านที่ตรงกับฉลากนี้");
      } catch (error) {
        console.error(error);
        setNotice({ tone: "error", text: "อ่านฉลากไม่สำเร็จ กรอกข้อมูลเองหรือถ่ายใหม่" });
        setLoading(false);
        setStage(null);
        setSheetOpen(true);
        toast.error("อ่านฉลากไม่สำเร็จ");
      } finally {
      setLoading(false);
      setStage(null);
      setLastMs(Date.now() - startedAt);
      handlingRef.current = false;
    }
    },
    [applyIdentify],
  );

  /** ดึงภาพนิ่งจากวิดีโอที่กำลังเล่นอยู่ (ไม่ต้องต่อกล้องใหม่) */
  const captureFrame = useCallback(async (): Promise<File | null> => {
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_REGION_ID} video`);
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(
            blob
              ? new File([blob], `auto-label-${Date.now()}.jpg`, { type: "image/jpeg" })
              : null,
          );
        },
        "image/jpeg",
        0.85,
      );
    });
  }, []);

  /** ปุ่มถ่ายมือ: ดึงภาพทันทีโดยไม่รอภาพนิ่ง แล้วใช้โหมดเร็ว (ลองครั้งเดียว ไม่มีรอบสอง) */
  const shutter = useCallback(async () => {
    if (!scanning || loading || handlingRef.current) return;
    if (Date.now() < cooldownRef.current) return;
    cooldownRef.current = Date.now() + 2000;
    setAutoStatus("capturing");
    try {
      const file = await captureFrame();
      if (!file) {
        setAutoStatus("searching");
        toast.error("ยังไม่ได้ภาพจากกล้อง ลองอีกครั้ง");
        return;
      }
      beepCapture();
      await scanPhoto(file, { fast: true });
    } catch {
      setAutoStatus("searching");
      toast.error("ถ่ายภาพไม่สำเร็จ");
    }
  }, [scanning, loading, captureFrame, scanPhoto]);
  useEffect(() => {
    if (!scanning || loading || sheetOpen) {
      setAutoStatus("idle");
      return;
    }
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_REGION_ID} video`);
    if (!video) {
      setAutoStatus("idle");
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let prevGray: Uint8ClampedArray | null = null;
    let holdStart = 0;
    let stillSince = 0;
    let cancelled = false;
    let busy = false;

    const tick = () => {
      if (cancelled || busy || handlingRef.current) return;
      if (Date.now() < cooldownRef.current) return;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const maxSide = Math.max(video.videoWidth, video.videoHeight);
      const scale = Math.min(1, ANALYSIS_MAX_SIDE / maxSide);
      const width = Math.max(8, Math.round(video.videoWidth * scale));
      const height = Math.max(8, Math.round(video.videoHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // ใช้เฉพาะกลางภาพ 70% — ใบปะหน้าอยู่กลางกรอบเสมอ พื้นหลังไม่มากวน
      const cropW = Math.round(video.videoWidth * 0.7);
      const cropH = Math.round(video.videoHeight * 0.7);
      const cropX = Math.round((video.videoWidth - cropW) / 2);
      const cropY = Math.round((video.videoHeight - cropH) / 2);
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, width, height);

      const frame = analyzeCanvas(canvas);
      if (!frame) return;

      // ความนิ่ง: ต้องนิ่งพอให้ภาพไม่เบลอ (ภาพเบลอทำให้ OCR แม่นน้อยลง)
      const diff = prevGray ? frameDifference(prevGray, frame.gray) : 999;
      const moving = diff > 9;
      const label = looksLikeLabel(frame);
      // กระดาษกินเกือบทั้งกรอบ = จ่อใกล้เกิน ตัวอักษรริมใบหลุด — บอกให้ถอยแทนการรอเงียบ ๆ
      const tooClose = !label && looksTooClose(frame);
      prevGray = frame.gray;

      if (!label) {
        holdStart = 0;
        stillSince = 0;
        setAutoStatus(tooClose ? "stepback" : "searching");
        return;
      }

      const now = Date.now();
      if (!holdStart) holdStart = now;
      if (moving) {
        stillSince = 0;
      } else if (!stillSince) {
        stillSince = now;
      }

      const stillFor = stillSince ? now - stillSince : 0;
      if (stillFor >= AUTO_STILL_MS && now - holdStart >= AUTO_HOLD_MS) {
        holdStart = 0;
        stillSince = 0;
        busy = true;
        setAutoStatus("capturing");
        // บี๊บตอนจับภาพ — ผู้ใช้รู้ว่าติดแล้วแม้ไม่มองจอ
        beepCapture();
        void captureFrame().then((file) => {
          if (!file) {
            busy = false;
            setAutoStatus("searching");
            return;
          }
          void scanPhoto(file, { auto: true });
        });
        return;
      }
      setAutoStatus(stillFor >= AUTO_STILL_MS ? "holding" : "searching");
    };

    const timer = window.setInterval(tick, AUTO_TICK_MS);
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [scanning, loading, sheetOpen, captureFrame, scanPhoto]);

  /** ดึง track ของกล้องที่กำลังเล่นอยู่ (ใช้ควบคุมแฟลช) */
  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_REGION_ID} video`);
    const stream = video?.srcObject as MediaStream | null;
    const tracks = stream?.getVideoTracks?.() ?? [];
    return tracks.length ? tracks[0] : null;
  }, []);

  const detectTorch = useCallback(() => {
    const track = getVideoTrack();
    const caps = track?.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined;
    setTorchAvailable(Boolean(caps?.torch));
  }, [getVideoTrack]);

  const toggleTorch = useCallback(async () => {
    const track = getVideoTrack();
    if (!track) {
      toast.error("กล้องยังไม่พร้อมสำหรับแฟลช");
      return;
    }
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
      toast.error("เครื่องนี้เปิดแฟลชผ่านเบราว์เซอร์ไม่ได้");
    }
  }, [getVideoTrack, torchOn]);

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
        () => {
          // ปิดการอ่าน QR: หน้านี้ใช้ตรวจจับใบปะหน้าและถ่ายรูปเองเท่านั้น
        },
        () => {
          // ไม่ต้องแจ้ง error ทุกเฟรม
        },
      );
      setScanning(true);
      // ปลุก AudioContext จากการแตะของผู้ใช้ เพื่อให้บี๊บแรกดังเต็มเสียง
      unlockBeep();
      // ให้วิดีโอเริ่มเล่นก่อนแล้วค่อยตรวจว่าเครื่องนี้มีแฟลชไหม
      window.setTimeout(detectTorch, 600);
    } catch (error) {
      console.error(error);
      setCameraError(cameraErrorMessage(error));
      scannerRef.current = null;
      setScanning(false);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [scanning, detectTorch]);

  const scanAgain = useCallback(async () => {
    setSheetOpen(false);
    cooldownRef.current = Date.now() + AUTO_COOLDOWN_MS;
    setResult(null);
    setPrimaryMatch(null);
    setLastCode("");
    setAdded(false);
    setDraft(emptyFields());
    setNotice(null);
    setCandidates([]);
    setTracking(null);
    setSameParcel(null);

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

  /** เพิ่มบ้านที่มีอยู่แล้วเข้าคิวนำทางวันนี้ */
  const addHouseToNavigation = useCallback(
    async (house: House, trackingNumber: string | null): Promise<boolean> => {
      if (adding) return false;
      setAdding(true);
      try {
        const post = (force: boolean) =>
          fetch("/api/navigation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              house_id: house.id,
              tracking_number: trackingNumber,
              as_parcel: true,
              force,
            }),
          });

        let res = await post(false);
        let json = await res.json().catch(() => ({}));

        if (res.status === 409 && json.duplicate) {
          if (json.same_stop) {
            setAdded(true);
            toast.error("บ้านนี้มีพัสดุเลขนี้ในคิวแล้ว");
            return true;
          }
          // เลขพัสดุซ้ำกับบ้านอื่นในวันนี้ → เตือนและให้ผู้ใช้ยืนยันเอง
          const proceed = window.confirm(
            `เลขพัสดุ ${trackingNumber ?? ""} ถูกบันทึกวันนี้แล้ว\nต้องการเพิ่มซ้ำหรือไม่?`,
          );
          if (!proceed) return false;
          res = await post(true);
          json = await res.json().catch(() => ({}));
        }

        if (!res.ok) throw new Error(json.error || "เพิ่มไม่สำเร็จ");

        setAdded(true);
        const count = Number(json.parcel_count ?? 1);
        toast.success(
          json.added_to_existing
            ? `เพิ่มพัสดุชิ้นที่ ${count} ที่บ้านนี้แล้ว`
            : "เพิ่มเข้าคิวนำทางแล้ว",
        );
        return true;
      } catch (error) {
        console.error(error);
        toast.error("เพิ่มเข้าคิวนำทางไม่สำเร็จ");
        return false;
      } finally {
        setAdding(false);
      }
    },
    [adding],
  );

  /** เพิ่มปลายทางของวันนี้จากข้อมูลฉลาก โดยยังไม่สร้างบ้านถาวร */
  const addDraftToNavigation = useCallback(
    async (form: LabelFields): Promise<boolean> => {
      if (adding) return false;
      const address = composeAddress(form);
      if (!form.name.trim() && !form.phone.trim() && !address) {
        toast.error("กรอกอย่างน้อยชื่อ เบอร์ หรือที่อยู่");
        return false;
      }
      setAdding(true);
      try {
        const post = (force: boolean) =>
          fetch("/api/navigation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              destination: { name: form.name, phone: form.phone, address },
              tracking_number: form.tracking.trim() || null,
              as_parcel: true,
              force,
            }),
          });

        let res = await post(false);
        let json = await res.json().catch(() => ({}));
        if (res.status === 409 && json.duplicate) {
          const proceed = window.confirm(
            `เลขพัสดุ ${form.tracking} ถูกบันทึกวันนี้แล้ว\nต้องการเพิ่มซ้ำหรือไม่?`,
          );
          if (!proceed) return false;
          res = await post(true);
          json = await res.json().catch(() => ({}));
        }
        if (!res.ok) throw new Error(json.error || "เพิ่มไม่สำเร็จ");
        setAdded(true);
        toast.success("เพิ่มเข้านำทางวันนี้แล้ว (ยังไม่ได้บันทึกเป็นบ้านถาวร)");
        return true;
      } catch (error) {
        console.error(error);
        toast.error("เพิ่มเข้านำทางไม่สำเร็จ");
        return false;
      } finally {
        setAdding(false);
      }
    },
    [adding],
  );

  const addPrimary = useCallback(
    async (form: LabelFields): Promise<boolean> => {
      const ok = result
        ? await addHouseToNavigation(result, form.tracking.trim() || null)
        : await addDraftToNavigation(form);
      if (ok) {
        // เพิ่มเสร็จ → ปิดหน้าผลสแกนทันที แล้วกลับไปสแกนชิ้นถัดไปต่อ
        setSheetOpen(false);
        cooldownRef.current = Date.now() + AUTO_COOLDOWN_MS;
        setAutoStatus("idle");
        // กันกรณีกล้องถูก pause ไว้ — เปิดต่อเพื่อจ่อใบถัดไป
        try {
          scannerRef.current?.resume();
        } catch {
          // resume ไม่ได้ก็ปล่อยให้ผู้ใช้กดเปิดกล้องเอง
        }
      }
      return ok;
    },
    [result, addHouseToNavigation, addDraftToNavigation],
  );

  /** บันทึกข้อมูล: มีบ้านอยู่แล้ว = แก้ไขบ้านหลังนั้น, ยังไม่มี = สร้างบ้านใหม่ */
  const savePrimary = useCallback(
    async (form: LabelFields): Promise<boolean> => {
      const address = composeAddress(form);
      if (!form.name.trim() && !form.phone.trim() && !address) {
        toast.error("กรอกอย่างน้อยชื่อ เบอร์ หรือที่อยู่");
        return false;
      }
      if (adding) return false;
      setAdding(true);
      try {
        const payload = {
          full_name: form.name.trim() || null,
          phone: form.phone.trim() || null,
          address: address || null,
        };

        if (result) {
          const res = await fetch(`/api/houses/${encodeURIComponent(result.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              lat: result.lat,
              lng: result.lng,
              note: result.note,
              quantity: result.quantity,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "บันทึกการแก้ไขไม่สำเร็จ");
          if (json.data) setResult(json.data as House);
          toast.success("บันทึกการแก้ไขแล้ว");
          return true;
        }

        const res = await fetch("/api/houses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, note: null, quantity: 1 }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "บันทึกบ้านใหม่ไม่สำเร็จ");
        if (json.data) {
          setResult(json.data as House);
          setPrimaryMatch(null);
        }
        toast.success("บันทึกเป็นบ้านใหม่แล้ว");
        return true;
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
        return false;
      } finally {
        setAdding(false);
      }
    },
    [adding, result],
  );

  // แตะบ้านแนะนำ → ยกขึ้นเป็นผลหลักบนสุด แล้วสลับหลังเดิมลงรายการแนะนำ
  const selectCandidate = useCallback(
    (candidate: HouseMatch) => {
      const previous: HouseMatch | null =
        result && primaryMatch && primaryMatch.house.id !== candidate.house.id
          ? primaryMatch
          : null;
      setCandidates((current) => {
        const rest = current.filter((c) => c.house.id !== candidate.house.id);
        return previous ? [previous, ...rest] : rest;
      });
      setResult(candidate.house);
      setPrimaryMatch(candidate);
      setAdded(false);
    },
    [result, primaryMatch],
  );

  const searchManual = useCallback(async () => {
    const code = manualCode.trim();
    if (!code) {
      toast.error("กรอกหรือวางรหัสก่อนค้นหา");
      return;
    }
    setLoading(true);
    setLoadingTitle("กำลังค้นหาบ้าน");
    setStage("กำลังค้นหาบ้านในคลัง…");
    setSheetOpen(false);
    setDraft(emptyFields());
    setNotice(null);
    setAdded(false);
    setSameParcel(null);
    setLastCode(code);
    try {
      const found = await applyIdentify(code);
      setLoading(false);
      setStage(null);
      setSheetOpen(true);
      if (found) toast.success("พบบ้านแล้ว");
      else toast.error("ไม่พบข้อมูลบ้านจากรหัสนี้");
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStage(null);
      setSheetOpen(true);
      toast.error("ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
      setStage(null);
    }
  }, [applyIdentify, manualCode]);

  const primaryForSheet: ScanPrimary = {
    house: result,
    match: primaryMatch,
  };

  /** ปิดชีตเอง → เว้นช่วงสั้น ๆ กันสแกนใบเดิมซ้ำทันที */
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    cooldownRef.current = Date.now() + AUTO_COOLDOWN_MS;
  }, []);

  return (
    <div className="page-shell mx-auto max-w-xl px-4 py-6 pb-32 sm:py-8 md:pb-8">
      <div className="mb-5">
        <h1 className="page-title">
          <ScanText className="h-7 w-7 text-teal-700" aria-hidden="true" />
          สแกนใบปะหน้า
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-600">
          เปิดกล้องแล้วจ่อใบปะหน้าให้อยู่กลางกรอบ ระบบจะถ่ายและอ่านให้เองทีละใบ
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
              <ScanText className="h-12 w-12" aria-hidden="true" />
              <p className="text-sm font-medium">
                {starting
                  ? "กำลังเปิดกล้อง..."
                  : "กดเปิดกล้อง แล้วจ่อใบปะหน้าให้อยู่ในกรอบ"}
              </p>
            </div>
          )}

          {scanning && torchAvailable && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-pressed={torchOn}
              aria-label={torchOn ? "ปิดแฟลช" : "เปิดแฟลช"}
              className={`absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-colors ${
                torchOn
                  ? "border-amber-300 bg-amber-400 text-amber-950"
                  : "border-white/30 bg-black/45 text-white"
              }`}
            >
              {torchOn ? (
                <Zap className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ZapOff className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          )}

          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
              <Loader2
                className="h-9 w-9 animate-spin text-white"
                aria-label="กำลังเปิดกล้อง"
              />
            </div>
          )}

          {scanning && !loading && (
            <button
              type="button"
              onClick={() => void shutter()}
              aria-label="ถ่ายภาพทันที"
              className="absolute bottom-3 left-1/2 z-10 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 backdrop-blur transition active:scale-95"
            >
              <span className="h-11 w-11 rounded-full bg-white" aria-hidden="true" />
            </button>
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
                disabled={starting || loading}
                className="btn btn-primary flex-1"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                {starting ? "กำลังเปิดกล้อง..." : "เปิดกล้องสแกน"}
              </button>
            )}
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void scanPhoto(file);
            }}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={loading}
            className="btn btn-secondary mt-2 w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanText className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="truncate">
              {loading ? "กำลังทำงาน..." : "ถ่ายรูปเอง (สำรอง)"}
            </span>
          </button>

          <div
            role="status"
            aria-live="polite"
            className="mt-2 flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-[11px] font-medium text-teal-900"
          >
            <span
              className={`h-2 w-2 flex-none rounded-full ${
                autoStatus === "holding" || autoStatus === "capturing"
                  ? "animate-pulse bg-teal-600"
                  : autoStatus === "stepback"
                    ? "bg-amber-500"
                    : "bg-teal-400"
              }`}
              aria-hidden="true"
            />
            {!scanning
              ? "กด “เปิดกล้องสแกน” เพื่อเริ่มจับใบปะหน้า"
              : autoStatus === "holding"
                ? "ถือไว้อีกนิด ระบบกำลังจะถ่ายให้เอง…"
                : autoStatus === "capturing"
                  ? "กำลังอ่านฉลาก…"
                  : autoStatus === "stepback"
                    ? "จ่อใกล้เกินไป — ถอยกล้องออกให้เห็นขอบใบปะหน้า"
                    : "จ่อใบปะหน้าให้อยู่กลางกรอบ ระบบจะถ่ายและอ่านให้เอง"}
          </div>
          {lastMs !== null && (
            <p className="mt-1 text-[11px] text-gray-500">
              รอบล่าสุดใช้เวลา {(lastMs / 1000).toFixed(1)} วินาที (ตั้งแต่ถ่ายภาพจนได้ผล)
            </p>
          )}

          {cameraError && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span>{cameraError}</span>
            </div>
          )}

          {lastCode && !loading && (
            <p className="mt-3 break-all text-xs text-gray-500">
              รหัสที่อ่านได้: <span className="font-mono">{lastCode}</span>
            </p>
          )}
        </div>
      </section>

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
            disabled={loading}
            className="btn btn-primary"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            ค้นหา
          </button>
        </div>
      </section>

      <BlockingLoader
        open={loading}
        title={loadingTitle}
        stage={stage}
        message="ระบบกำลังอ่านและเทียบข้อมูล กรุณารอสักครู่"
      />

      <ScanResultSheet
        open={sheetOpen && !loading}
        primary={primaryForSheet}
        draft={draft}
        candidates={candidates}
        tracking={tracking}
        notice={notice}
        sameParcel={sameParcel}
        busy={adding}
        added={added}
        onClose={closeSheet}
        onAdd={addPrimary}
        onSave={savePrimary}
        onSelectCandidate={selectCandidate}
        onScanAgain={() => void scanAgain()}
      />
    </div>
  );
}
