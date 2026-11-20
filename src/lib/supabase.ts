import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// ตรวจสอบว่ามีการระบุ URL และ Key ที่ถูกต้องหรือไม่
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://placeholder.supabase.co" &&
    supabaseUrl.startsWith("http")
);

// แจ้งเตือนใน Console หากยังไม่มีการตั้งค่า Environment Variables
if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[DropWay] ไม่พบการตั้งค่า Supabase URL หรือ Anon Key ใน .env.local\n" +
      "กรุณาตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
      "ดูวิธีตั้งค่าได้ที่ไฟล์ .env.example หรือรันคำสั่ง: npm run test:supabase"
  );
}

// Fallback ด้วย placeholder เพื่อป้องกันแอปพังแบบ Fatal Crash เมื่อยังไม่ได้กำหนดค่าใน .env.local
export const supabase = createBrowserClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
