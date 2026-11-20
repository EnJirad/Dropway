"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  LogOut,
  MapPinned,
  ScanLine,
  Settings,
  UserRound,
  Warehouse,
} from "lucide-react";
import { toast } from "react-hot-toast";

type AppUser = {
  id: string;
  email?: string;
  name?: string;
};

type Stats = {
  houses: number | null;
  today: number | null;
  delivered: number | null;
};

const MENU: { href: string; label: string; desc: string; Icon: typeof Warehouse }[] = [
  { href: "/navigation", label: "การนำทางของฉัน", desc: "รายการส่งวันนี้และสถานะ", Icon: MapPinned },
  { href: "/houses", label: "คลังบ้าน", desc: "ค้นหา เพิ่ม และแก้ไขข้อมูลบ้าน", Icon: Warehouse },
  { href: "/scan", label: "สแกนใบปะหน้า", desc: "สแกนพัสดุและเพิ่มเข้าคิว", Icon: ScanLine },
];

function initialOf(user: AppUser | null): string {
  const text = (user?.name || user?.email || "?").trim();
  return text ? text.slice(0, 1).toUpperCase() : "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<Stats>({ houses: null, today: null, delivered: null });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dropway_user");
      if (raw) {
        const parsed = JSON.parse(raw) as AppUser;
        if (parsed && typeof parsed === "object") setUser(parsed);
      }
    } catch {
      // JSON เสีย — แสดงโปรไฟล์ว่างแทน
    }
    setLoaded(true);
  }, []);

  // ตัวเลขสรุป: ดึงจาก API เดียวกับหน้าอื่น ถ้า DB ยังไม่ตั้งค่าจะเป็น 0
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [houses, nav] = await Promise.allSettled([
        fetch("/api/houses").then((res) => res.json()),
        fetch("/api/navigation").then((res) => res.json()),
      ]);

      if (cancelled) return;

      const houseList = houses.status === "fulfilled" && Array.isArray(houses.value?.data)
        ? houses.value.data
        : [];
      const navList = nav.status === "fulfilled" && Array.isArray(nav.value?.data)
        ? nav.value.data
        : [];

      setStats({
        houses: houseList.length,
        today: navList.filter(
          (row: { delivery_status?: string | null }) =>
            !row.delivery_status || row.delivery_status === "pending",
        ).length,
        delivered: navList.filter(
          (row: { delivery_status?: string | null }) => row.delivery_status === "delivered",
        ).length,
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => user?.name || user?.email?.split("@")[0] || "ผู้ใช้งาน", [user]);

  const logout = () => {
    try {
      window.localStorage.removeItem("dropway_user");
    } catch {
      // ignore
    }
    toast.success("ออกจากระบบแล้ว");
    router.replace("/login");
  };

  return (
    <div className="page-shell mx-auto max-w-xl px-4 py-6 pb-32 sm:py-8 md:pb-8">
      {/* หัวหน้า: โปรไฟล์ + ปุ่มตั้งค่ามุมขวาบน */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">
            <UserRound className="h-7 w-7 text-teal-700" aria-hidden="true" />
            โปรไฟล์
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-600">
            ข้อมูลบัญชีและทางลัดการใช้งานของคุณ
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="เปิดหน้าตั้งค่า"
          title="ตั้งค่า"
          className="btn btn-secondary h-11 w-11 flex-none p-0"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      {/* การ์ดโปรไฟล์ */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-teal-50 text-2xl font-bold text-teal-700"
            aria-hidden="true"
          >
            {initialOf(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-gray-900">{title}</p>
            <p className="mt-0.5 truncate text-sm text-gray-600">
              {user?.email || "ยังไม่ได้เข้าสู่ระบบ"}
            </p>
            <span className="badge badge-teal mt-2">พนักงานขับรถ</span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-xs">
          <div>
            <dt className="text-gray-500">รหัสผู้ใช้</dt>
            <dd className="mt-0.5 truncate font-mono text-gray-800">{user?.id || "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">สถานะบัญชี</dt>
            <dd className="mt-0.5 font-bold text-teal-700">
              {loaded ? (user ? "ใช้งานอยู่" : "ยังไม่เข้าสู่ระบบ") : "กำลังโหลด…"}
            </dd>
          </div>
        </dl>
      </section>

      {/* ตัวเลขสรุป */}
      <section className="mt-4 grid grid-cols-3 gap-2" aria-label="สรุปงาน">
        {[
          { label: "บ้านในคลัง", value: stats.houses },
          { label: "ต้องส่งวันนี้", value: stats.today },
          { label: "ส่งแล้ว", value: stats.delivered },
        ].map((item) => (
          <div key={item.label} className="card p-3 text-center">
            <p className="text-2xl font-extrabold text-teal-700">
              {item.value === null ? "—" : item.value.toLocaleString("th-TH")}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-500">{item.label}</p>
          </div>
        ))}
      </section>

      {/* เมนูทางลัด */}
      <section className="card mt-4 overflow-hidden" aria-label="เมนูโปรไฟล์">
        <ul className="divide-y divide-gray-100">
          {MENU.map(({ href, label, desc, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900">{label}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{desc}</span>
                </span>
                <ChevronRight className="h-5 w-5 flex-none text-gray-300" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={logout}
        className="btn btn-secondary mt-4 w-full border-red-200 text-red-700 hover:bg-red-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        ออกจากระบบ
      </button>

      <p className="mt-4 text-center text-[11px] text-gray-400">
        DropWay • ข้อมูลบัญชีเก็บไว้ในเครื่องนี้เท่านั้น
      </p>
    </div>
  );
}
