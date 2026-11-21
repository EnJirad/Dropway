/**
 * ปรับความคมชัดของภาพก่อนส่งให้ AI/OCR
 *
 * ใช้ unsharp mask แบบเบา ๆ (kernel [0,-1,0 / -1,5,-1 / 0,-1,0]) กับขอบภาพ
 * ช่วยให้ตัวอักษรบนใบปะหน้าที่ถ่ายจากกล้องมือถืออ่านง่ายขึ้น
 * โดยไม่ต้องเพิ่มความละเอียด (ซึ่งจะทำให้อัปโหลดช้าลง)
 */

export function sharpenCanvas(canvas: HTMLCanvasElement, amount = 0.45): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  if (width < 3 || height < 3) return;

  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    return; // canvas ถูก taint หรือหน่วยความจำไม่พอ
  }

  const src = new Uint8ClampedArray(image.data);
  const out = image.data;
  const k = Math.max(0, Math.min(1, amount));
  const row = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    const rowStart = y * row;
    for (let x = 1; x < width - 1; x += 1) {
      const i = rowStart + x * 4;
      for (let c = 0; c < 3; c += 1) {
        const center = src[i + c];
        const around =
          src[i - 4 + c] + src[i + 4 + c] + src[i - row + c] + src[i + row + c];
        const v = center * (1 + 4 * k) - k * around;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

/** ขอความละเอียดสูงและโฟกัสต่อเนื่อง (ทำหลังวิดีโอเล่นแล้ว — ถ้าไม่รองรับก็ข้ามไป) */
export async function tuneCameraTrack(track: MediaStreamTrack | null): Promise<void> {
  if (!track || typeof track.applyConstraints !== "function") return;
  // 1) ขอความละเอียดสูงขึ้นแบบ ideal (ไม่บังคับ — เครื่องที่ไม่รับจะคงค่าเดิม)
  try {
    await track.applyConstraints({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    });
  } catch {
    // ไม่รองรับความละเอียดนี้ — ใช้ค่าเดิมของกล้อง
  }
  // 2) ขอโฟกัส/แสงต่อเนื่อง
  try {
    // บางรุ่น/บางเบราว์เซอร์ไม่มีฟิลด์เหล่านี้ใน type — ส่งแบบ runtime แล้วกล้องจะเมินถ้าไม่รองรับ
    const advanced = [
      { focusMode: "continuous" },
      { exposureMode: "continuous" },
      { whiteBalanceMode: "continuous" },
    ] as unknown as MediaTrackConstraintSet[];
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    // รุ่นที่ไม่รองรับ — ใช้ค่า default ของกล้อง
  }
}
