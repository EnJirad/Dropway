"use client";

import { useEffect } from "react";
import { ScanText } from "lucide-react";

type Props = {
  open: boolean;
  /** หัวข้อหลักที่ผู้ใช้เห็น เช่น "กำลังอ่านฉลาก" */
  title?: string;
  /** ขั้นตอนปัจจุบัน เปลี่ยนได้ระหว่างทำงาน */
  stage?: string | null;
  /** คำอธิบายเพิ่มเติม (ไม่บังคับ) */
  message?: string | null;
};

/**
 * ตัวโหลดแบบบล็อกทั้งจอ
 *
 * ใช้ระหว่างอ่านฉลาก/เทียบข้อมูล: ผู้ใช้กดอย่างอื่นไม่ได้เลยจนกว่าจะเสร็จ
 * - overlay ครอบviewport ทั้งหมดและดักคลิกไม่ให้ทะลุไปด้านหลัง
 * - ล็อกการเลื่อนหน้า และไม่ปิดด้วย Escape (ต้องรอผลลัพธ์เท่านั้น)
 */
export default function BlockingLoader({ open, title = "กำลังอ่านฉลาก", stage, message }: Props) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="blocking-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={title}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.preventDefault();
      }}
    >
      <div className="blocking-card">
        <div className="blocking-orbit" aria-hidden="true">
          <span className="blocking-ring" />
          <span className="blocking-ring blocking-ring-inner" />
          <ScanText className="blocking-icon h-9 w-9" />
        </div>

        <p className="blocking-title">{title}</p>
        {stage ? (
          <p className="blocking-stage" aria-live="polite">
            {stage}
          </p>
        ) : null}
        {message ? <p className="blocking-message">{message}</p> : null}

        <span className="blocking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
