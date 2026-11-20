/**
 * OCR ในเครื่อง (Tesseract) แบบเร็ว
 *
 * ความเร็วมาจาก 3 อย่าง:
 * 1. เก็บ worker ไว้ใช้ซ้ำ — สร้างครั้งแรกครั้งเดียว ไม่ terminate ทุกครั้งที่สแกน
 * 2. warmup ล่วงหน้าตอนเข้าหน้า ผู้ใช้ถ่ายรูปเสร็จ worker พร้อมแล้ว
 * 3. preprocess ด้วย canvas ครั้งเดียว (ย่อ/ขยาย + เทา + เพิ่มคอนทราสต์) ก่อนส่ง OCR
 *
 * ทุกฟังก์ชันไม่ throw ออกไปนอกไฟล์: ผู้เรียกได้ { ok: false } ไปแสดงสถานะแทน
 */

type OcrWorker = {
  recognize: (image: HTMLCanvasElement | string) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

/** เก็บ worker ไว้ในโมดูล ใช้ร่วมกันทุกครั้งที่สแกน */
let workerPromise: Promise<OcrWorker> | null = null;
/** นับงานที่กำลังทำอยู่ ห้าม terminate ระหว่างนี้ */
let inFlight = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** ปิด worker เมื่อไม่ถูกใช้ครบเวลานี้ (คืนหน่วยความจำบนมือถือ) */
const IDLE_DISPOSE_MS = 90_000;
/** ด้านยาวสุดของภาพที่ส่ง OCR — ใหญ่พอให้ตัวหนังสือเล็กอ่านได้ ไม่ใหญ่จนช้า */
const OCR_MAX_SIDE = 1800;
/** ย่อภาพเล็กให้น้อยกว่านี้ไม่ได้ เพราะตัวหนังสือจะแตก */
const OCR_MIN_SIDE = 1100;

function clearIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleDispose() {
  clearIdleTimer();
  if (inFlight > 0) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (inFlight > 0) return;
    void disposeOcr();
  }, IDLE_DISPOSE_MS);
}

async function buildWorker(): Promise<OcrWorker> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = (await createWorker(["tha", "eng"])) as unknown as OcrWorker;
  try {
    await worker.setParameters({
      // AUTO อ่านได้ทั้งบล็อกข้อความและบรรทัดเดี่ยวแบบฉลากพัสดุ
      tessedit_pageseg_mode: String(PSM.AUTO),
      // รักษาช่องว่างระหว่างคำ ช่วยแยกชื่อ/ที่อยู่
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
  } catch {
    // พารามิเตอร์บางตัวไม่มีในบางเวอร์ชัน — ใช้ค่าเริ่มต้นต่อได้
  }
  return worker;
}

/** คืน worker (สร้างครั้งแรกครั้งเดียว) */
export function getOcrWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = buildWorker().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** เรียกตอนเข้าหน้าสแกน เพื่อให้ worker พร้อมก่อนผู้ใช้ถ่ายรูปเสร็จ */
export function warmupOcr(): void {
  if (typeof window === "undefined") return;
  void getOcrWorker()
    .then(() => scheduleIdleDispose())
    .catch(() => {
      // เน็ตช้าหรือ worker สร้างไม่ได้ — ปล่อยให้ลองใหม่ตอนสแกนจริง
    });
}

/** ปิด worker ทิ้ง (เรียกตอนออกจากหน้า) */
export async function disposeOcr(): Promise<void> {
  clearIdleTimer();
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // ปิดไม่สำเร็จก็ปล่อย — ตัวถัดไปจะสร้างใหม่
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("เปิดรูปไม่ได้"));
    };
    image.src = url;
  });
}

/**
 * เตรียมภาพให้ OCR: ขยายภาพเล็กให้พออ่านตัวหนังสือ, ย่อภาพใหญ่เพื่อความเร็ว,
 * แปลงเป็นขาวเทา แล้วยืดคอนทราสต์ด้วย percentile 5–95 (เร็วและไม่ทำให้ตัวหนังสือขาด)
 */
export async function preprocessForOcr(file: File): Promise<HTMLCanvasElement> {
  const image = await loadImage(file);
  const natural = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const target = Math.min(OCR_MAX_SIDE, Math.max(OCR_MIN_SIDE, natural));
  const scale = target / natural;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("เตรียมภาพไม่ได้");
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;

  // สุ่มหาค่าแสงต่ำ/สูงจริงของภาพ (ทุก ๆ 7 พิกเซล) เพื่อไม่ให้ noise กำหนดช่วง
  const step = 7 * 4;
  const samples: number[] = [];
  for (let i = 0; i < px.length; i += step) {
    samples.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
  }
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * 0.05)] ?? 0;
  const high = samples[Math.floor(samples.length * 0.95)] ?? 255;
  const range = Math.max(1, high - low);

  if (range < 250) {
    for (let i = 0; i < px.length; i += 4) {
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const value = Math.max(0, Math.min(255, Math.round(((gray - low) / range) * 255)));
      px[i] = value;
      px[i + 1] = value;
      px[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

export type OcrAttempt =
  | { ok: true; text: string; ms: number }
  | { ok: false; ms: number; message: string };

/**
 * อ่านข้อความจากรูปฉลาก ไม่ throw
 * ผู้เรียกใช้ผลลัพธ์เพื่อส่งเข้าตัวแยกข้อมูล (labelParse) ต่อ
 */
export async function recognizeLabel(file: File): Promise<OcrAttempt> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const canvas = await preprocessForOcr(file);
    const worker = await getOcrWorker();
    inFlight += 1;
    clearIdleTimer();
    try {
      const result = await worker.recognize(canvas);
      return {
        ok: true,
        text: result.data.text ?? "",
        ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
      };
    } finally {
      inFlight -= 1;
      scheduleIdleDispose();
    }
  } catch (error) {
    return {
      ok: false,
      ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
      message: error instanceof Error ? error.message : "OCR ทำงานไม่สำเร็จ",
    };
  }
}
