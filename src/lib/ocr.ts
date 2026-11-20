/**
 * OCR ในเครื่อง (Tesseract)
 *
 * ความเร็ว:
 * - เก็บ worker ไว้ใช้ซ้ำ สร้างครั้งแรกครั้งเดียว + warmup ตอนเข้าหน้า
 * - ปิด worker เมื่อ idle
 *
 * ความแม่น:
 * - รอบแรกใช้ภาพที่ปรับคอนทราสต์เล็กน้อย
 * - ถ้าผลออกมาไม่มั่นใจ (confidence ต่ำ / ตัวอักษรไทยน้อย) จะอ่านซ้ำด้วยภาพต้นฉบับ
 *   แล้วเลือกผลที่ดีกว่า — ภาพต้นฉบับช่วยได้มากเมื่อภาพมีแสงไม่สม่ำเสมอหรือพิมพ์จาง
 */

type OcrWorker = {
  recognize: (
    image: HTMLCanvasElement | string,
  ) => Promise<{ data: { text: string; confidence?: number } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;
let inFlight = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_DISPOSE_MS = 90_000;
/** ด้านยาวสุดของภาพที่ส่ง OCR */
const OCR_MAX_SIDE = 2000;
/** ภาพเล็กกว่านี้ขยายขึ้นเพื่อให้ตัวหนังสืออ่านง่าย */
const OCR_MIN_SIDE = 1000;
/** ต่ำกว่านี้ถือว่าผลยังไม่น่าเชื่อถือ ให้ลองอีกรอบด้วยภาพต้นฉบับ */
const RETRY_CONFIDENCE = 70;
/** ตัวอักษรไทยน้อยกว่านี้ถือว่าอ่านไม่ครบ */
const RETRY_THAI_CHARS = 10;
/** เวลารวมสูงสุดก่อนหยุดลองหมุนภาพ (ms) */
const ROTATION_BUDGET_MS = 12_000;

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
      tessedit_pageseg_mode: String(PSM.AUTO),
      user_defined_dpi: "300",
    });
  } catch {
    // พารามิเตอร์บางตัวไม่มีในบางเวอร์ชัน — ใช้ค่าเริ่มต้นต่อได้
  }
  return worker;
}

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
      // worker สร้างไม่ได้ — ปล่อยให้ลองใหม่ตอนสแกนจริง
    });
}

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

/** วาดภาพลง canvas โดยคุมขนาดด้านยาวสุด */
async function toCanvas(file: File): Promise<HTMLCanvasElement> {
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
  return canvas;
}

/**
 * ปรับภาพแบบเบา ๆ: เทา + ยืดคอนทราสต์เฉพาะภาพที่ช่วงแสงแคบจริง
 * (ภาพที่แสงดีอยู่แล้วปล่อยไว้ ไม่ทำให้ตัวหนังสือจางหาย)
 */
function enhanceContrast(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;

  const samples: number[] = [];
  const step = 7 * 4;
  for (let i = 0; i < px.length; i += step) {
    samples.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
  }
  if (samples.length === 0) return;
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * 0.05)] ?? 0;
  const high = samples[Math.floor(samples.length * 0.95)] ?? 255;
  const range = Math.max(1, high - low);

  // ช่วงแสงกว้างอยู่แล้ว = ภาพชัด ไม่ต้องแตะ
  if (range >= 180) return;

  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const value = Math.max(0, Math.min(255, Math.round(((gray - low) / range) * 255)));
    px[i] = value;
    px[i + 1] = value;
    px[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
}

/** ภาพที่ผ่านการปรับคอนทราสต์ (ใช้ทดสอบ/เรียกแยกได้) */
export async function preprocessForOcr(file: File): Promise<HTMLCanvasElement> {
  const canvas = await toCanvas(file);
  enhanceContrast(canvas);
  return canvas;
}

function thaiCharCount(text: string): number {
  const matches = text.match(/[\u0E00-\u0E7F]/g);
  return matches ? matches.length : 0;
}

/** หมุนภาพเป็นจำนวนเท่าของ 90° (1=90, 2=180, 3=270) */
function rotateCanvas(source: HTMLCanvasElement, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return source;
  const swap = turns === 1 || turns === 3;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? source.height : source.width;
  canvas.height = swap ? source.width : source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

type OcrPass = { text: string; confidence: number };

function quality(pass: OcrPass): number {
  // confidence เป็นหลัก แต่นับตัวอักษรไทยที่อ่านได้ด้วย (ภาษาไทยคือข้อมูลสำคัญ)
  return pass.confidence + Math.min(15, thaiCharCount(pass.text) / 4);
}

function needsRetry(pass: OcrPass): boolean {
  return pass.confidence < RETRY_CONFIDENCE || thaiCharCount(pass.text) < RETRY_THAI_CHARS;
}

export type OcrAttempt =
  | { ok: true; text: string; ms: number; confidence: number; passes: number }
  | { ok: false; ms: number; message: string };

/**
 * อ่านข้อความจากรูปฉลาก ไม่ throw
 * คืนข้อความที่ดีที่สุดจากการอ่าน 1–2 รอบ
 */
export async function recognizeLabel(file: File): Promise<OcrAttempt> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = () =>
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;

  try {
    const canvas = await toCanvas(file);
    const worker = await getOcrWorker();

    inFlight += 1;
    clearIdleTimer();
    try {
      const passes: OcrPass[] = [];

      // รอบแรก: ภาพต้นฉบับ (แม่นที่สุดเมื่อภาพชัด)
      const first = await worker.recognize(canvas);
      passes.push({
        text: first.data.text ?? "",
        confidence: typeof first.data.confidence === "number" ? first.data.confidence : 0,
      });

      // รอบสอง: เฉพาะเมื่อผลยังไม่น่าเชื่อถือ → เพิ่มคอนทราสต์แล้วอ่านซ้ำ
      if (needsRetry(passes[0])) {
        const enhanced = await preprocessForOcr(file);
        const second = await worker.recognize(enhanced);
        passes.push({
          text: second.data.text ?? "",
          confidence: typeof second.data.confidence === "number" ? second.data.confidence : 0,
        });
      }

      const best = passes.reduce((a, b) => (quality(b) > quality(a) ? b : a));

      // ใบปะหน้าเอียง/ตะแคง: ถ้าอ่านตรง ๆ ยังไม่ดี ให้ลองหมุน 90/270/180 องศา
      let chosen = best;
      if (needsRetry(best)) {
        for (const turns of [1, 3, 2]) {
          if (elapsed() > ROTATION_BUDGET_MS) break;
          const rotated = rotateCanvas(canvas, turns);
          const res = await worker.recognize(rotated);
          const pass: OcrPass = {
            text: res.data.text ?? "",
            confidence: typeof res.data.confidence === "number" ? res.data.confidence : 0,
          };
          passes.push(pass);
          if (quality(pass) > quality(chosen)) chosen = pass;
          // พอแล้วถ้าอ่านไทยได้ครบและมั่นใจสูง
          if (chosen.confidence >= 82 && thaiCharCount(chosen.text) >= 15) break;
        }
      }

      return {
        ok: true,
        text: chosen.text,
        confidence: Math.round(chosen.confidence),
        passes: passes.length,
        ms: elapsed(),
      };
    } finally {
      inFlight -= 1;
      scheduleIdleDispose();
    }
  } catch (error) {
    return {
      ok: false,
      ms: elapsed(),
      message: error instanceof Error ? error.message : "OCR ทำงานไม่สำเร็จ",
    };
  }
}
