/**
 * ตรวจว่าเฟรมจากกล้อง "น่าจะเป็นใบปะหน้าพัสดุ" หรือยัง โดยไม่ต้อง OCR
 *
 * ใช้ภาพย่อ (ด้านยาว ~320px) แล้ววัด 3 อย่างที่เร็วมากบนมือถือ:
 * - ความสว่าง/คอนทราสต์: ใบปะหน้าเป็นกระดาษขาวมีตัวหนังสือดำ
 * - สัดส่วนพิกเซลสว่าง (whiteRatio): ต้องเห็น "กระดาษ" อยู่ในกรอบกลางภาพ
 * - ความหนาแน่นขอบ (edgeRatio): ต้องมีตัวหนังสือ/เส้นตาราง ไม่ใช่ผนังเรียบ
 *
 * ตรวจจับได้แล้วหน้าเว็บยังต้องรอให้ภาพนิ่งต่อเนื่องอีกระยะก่อนถ่ายจริง
 */

export type FrameAnalysis = {
  /** ค่าเทาของทุกพิกเซล (ใช้เทียบความนิ่งระหว่างเฟรม) */
  gray: Uint8ClampedArray;
  mean: number;
  std: number;
  whiteRatio: number;
  edgeRatio: number;
};

/** ด้านยาวสุดของภาพที่ใช้วัด (เล็ก = เร็ว) */
export const ANALYSIS_MAX_SIDE = 320;

/** เกณฑ์ว่าภาพเหมือนใบปะหน้า */
export function looksLikeLabel(a: FrameAnalysis): boolean {
  return (
    a.mean > 95 &&
    a.std > 20 &&
    a.whiteRatio > 0.14 &&
    a.whiteRatio < 0.92 &&
    a.edgeRatio > 0.02 &&
    a.edgeRatio < 0.42
  );
}

/** ความต่างเฉลี่ยของสองเฟรม (0 = นิ่งสนิท) */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 255;
  let sum = 0;
  // สุ่มทุก 3 พิกเซลพอ — เร็วขึ้นโดยผลไม่ต่าง
  let count = 0;
  for (let i = 0; i < length; i += 3) {
    sum += Math.abs(a[i] - b[i]);
    count += 1;
  }
  return count ? sum / count : 255;
}

/** วัดเฟรมจาก canvas (ภาพย่อแล้ว) */
export function analyzeCanvas(canvas: HTMLCanvasElement): FrameAnalysis | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  if (width < 8 || height < 8) return null;

  const data = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  let sum = 0;
  let white = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gray[p] = value;
    sum += value;
    if (value > 170) white += 1;
  }

  const total = width * height;
  const mean = sum / total;

  let variance = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const d = gray[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / total);

  // ความหนาแน่นขอบ: ผลต่างกับพิกเซลข้าง ๆ เกินเกณฑ์
  let edges = 0;
  let compared = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(gray[i] - gray[i + 1]);
      const gy = Math.abs(gray[i] - gray[i + width]);
      if (gx + gy > 40) edges += 1;
      compared += 1;
    }
  }

  return {
    gray,
    mean,
    std,
    whiteRatio: white / total,
    edgeRatio: compared ? edges / compared : 0,
  };
}
