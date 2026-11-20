// C:\\DropWay\\New_Version\\dropway-final\\src\\components\\Navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LogOut, Warehouse, MapPinned, ScanLine, Settings, UserRound } from "lucide-react";

interface AppUser {
  id: string;
  email?: string;
  name?: string;
}

// Single source of truth for the in-app navigation destinations on mobile.
const MOBILE_TABS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/houses", label: "คลังหลัก", Icon: Warehouse },
  { href: "/navigation", label: "นำทาง", Icon: MapPinned },
  { href: "/scan", label: "สแกน", Icon: ScanLine },
];

function mobileTabClass(active: boolean) {
  return [
    "flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[13px] font-medium tracking-tight transition-colors zoom-pinch-ok",
    active ? "text-teal-700" : "text-gray-500 hover:text-teal-700",
  ].join(" ");
}

function mobileTabIconClass(active: boolean) {
  return [
    "flex h-8 w-12 items-center justify-center rounded-lg transition-colors",
    active ? "bg-teal-50 text-teal-700" : "bg-transparent text-current",
  ].join(" ");
}

export default function Navbar() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("dropway_user") : null;
        if (stored) {
          try {
            setUser(JSON.parse(stored));
            setLoading(false);
            return;
          } catch {}
        }
        setUser({ id: "neon-driver", email: "Neon Database", name: "คนขับ DropWay" });
      } catch {
        setUser({ id: "neon-driver", email: "Neon Database", name: "คนขับ DropWay" });
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const logout = () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("dropway_user");
      }
    } catch {
      // Ignore
    }
    location.href = "/login";
  };

  // Current section label for the mobile top header.
  const sectionLabel = (() => {
    if (pathname === "/houses") return "คลังบ้าน";
    if (pathname === "/navigation") return "นำทาง";
    if (pathname === "/scan") return "สแกน QR";
    if (pathname === "/settings") return "ตั้งค่า";
    if (pathname === "/profile") return "โปรไฟล์";
    if (pathname === "/login") return "เข้าสู่ระบบ";
    if (pathname === "/register") return "สมัครสมาชิก";
    return "DropWay";
  })();

  // ฟังก์ชันเช็กว่า path นี้ active หรือไม่
  const isActive = (path: string) => pathname === path;

  // กำลังโหลด — แสดงโครงที่นิ่งเหมือนจริง ไม่มีลิงก์ปลอม
  if (loading) {
    return (
      <>
        {/* Desktop Loading */}
        <nav className="hidden md:flex items-center justify-between border-b border-gray-200/90 bg-white px-4 py-3">
          <span className="text-lg font-semibold text-teal-700">DropWay</span>
          <div className="flex-1" />
        </nav>

        {/* Mobile header skeleton: same geometry as the real header, no links */}
        <div aria-hidden="true" className="mobile-top-header md:hidden">
          <div className="mobile-header-inner mx-auto flex max-w-3xl items-center justify-between px-4">
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>

        {/* Mobile Loading skeleton: same geometry as the real bottom bar, no links */}
        <div
          aria-hidden="true"
          className="mobile-bottom-nav md:hidden"
        >
          <div className="mobile-nav-inner mx-auto flex max-w-sm items-center justify-around px-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <div className="h-8 w-12 animate-pulse rounded-lg bg-gray-100" />
                <div className="h-3 w-10 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop Navbar */}
      <nav
        aria-label="แถบนำทางหลัก"
        className="hidden md:flex items-center justify-between border-b border-gray-200/90 bg-white px-4 py-3"
      >
        <div className="flex items-center gap-6">
          <Link href="/houses" className="text-lg font-semibold text-teal-700">
            DropWay
          </Link>
          {user && (
            <>
              <Link
                href="/houses"
                aria-current={isActive("/houses") ? "page" : undefined}
                className={`text-base font-semibold transition-colors ${
                  isActive("/houses")
                    ? "text-teal-700"
                    : "text-gray-500 hover:text-teal-700"
                }`}
              >
                คลังหลัก
              </Link>
              <Link
                href="/navigation"
                aria-current={isActive("/navigation") ? "page" : undefined}
                className={`text-base font-medium transition-colors ${
                  isActive("/navigation")
                    ? "text-teal-700"
                    : "text-gray-500 hover:text-teal-700"
                }`}
              >
                การนำทาง
              </Link>
              <Link
                href="/scan"
                aria-current={isActive("/scan") ? "page" : undefined}
                className={`text-base font-medium transition-colors ${
                  isActive("/scan")
                    ? "text-teal-700"
                    : "text-gray-500 hover:text-teal-700"
                }`}
              >
                สแกน QR
              </Link>
            </>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              className={`flex items-center gap-1.5 text-base font-medium transition-colors ${
                isActive("/settings")
                  ? "text-teal-700"
                  : "text-gray-500 hover:text-teal-700"
              }`}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              ตั้งค่า
            </Link>
            <button type="button" onClick={logout} className="btn btn-danger">
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        )}
      </nav>

      {/* Mobile Top Header — brand + current section, sticky */}
      <header className="mobile-top-header md:hidden">
        <div className="mobile-header-inner mx-auto flex max-w-3xl items-center justify-between px-4">
          <Link
            href={user ? "/houses" : "/login"}
            className="text-base font-semibold text-teal-700 zoom-pinch-ok"
          >
            DropWay
          </Link>
          <span className="badge badge-teal" aria-current="page">
            {sectionLabel}
          </span>
        </div>
      </header>

      {/* Mobile Bottom Bar — the only mobile navigation system */}
      <nav aria-label="แถบนำทางหลัก" className="mobile-bottom-nav md:hidden">
        <div className="mobile-nav-inner mx-auto flex max-w-sm items-center justify-around px-4">
          {user ? (
            <>
              {MOBILE_TABS.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={mobileTabClass(active)}
                  >
                    <span aria-hidden="true" className={mobileTabIconClass(active)}>
                      <Icon className="h-[22px] w-[22px]" />
                    </span>
                    <span>{label}</span>
                  </Link>
                );
              })}

              <Link
                href="/profile"
                aria-current={isActive("/profile") ? "page" : undefined}
                className={mobileTabClass(isActive("/profile"))}
              >
                <span aria-hidden="true" className={mobileTabIconClass(isActive("/profile"))}>
                  <UserRound className="h-[22px] w-[22px]" />
                </span>
                <span>โปรไฟล์</span>
              </Link>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-base font-semibold text-teal-700">DropWay</span>
            </div>
          )}
        </div>
      </nav>

    </>
  );
}
