/**
 * เสียงบี๊บสั้น ๆ ตอนจับภาพได้ — ให้ผู้ใช้รู้ว่า "ติดแล้ว" โดยไม่ต้องมองจอ
 * ใช้ WebAudio สร้างเอง ไม่ต้องโหลดไฟล์เสียง
 * ต้องปลุก AudioContext ตอนผู้ใช้แตะครั้งแรก (ข้อกำหนดของเบราว์เซอร์มือถือ)
 */

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;

/** เรียกตอนกดปุ่มเปิดกล้อง (ต้องมาจาก user gesture) */
export function unlockBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as AudioWindow;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    // ปลุก hardware ด้วยเสียงเงียบสั้น ๆ ครั้งเดียว ไม่งั้นบี๊บแรกจะหาย
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    // เบราว์เซอร์ไม่รองรับ — ข้ามไป ไม่ให้กระทบการสแกน
  }
}

/** บี๊บ 2.1kHz สั้น ๆ (ความถี่เดียวกับเครื่องสแกนบาร์โค้ดจริง) */
export function beepCapture(): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as AudioWindow;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 2100;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch {
    // ไม่มีเสียงก็ยังสแกนได้
  }
}
