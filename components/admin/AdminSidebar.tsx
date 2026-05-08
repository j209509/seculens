"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "概要" },
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/scans", label: "スキャン" },
];

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        background: "#0f172a",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "0 20px 24px 20px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
          Sequlia Admin
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          管理者パネル
        </div>
      </div>

      <nav style={{ flex: 1, padding: "16px 0" }}>
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "10px 20px",
                color: active ? "#fff" : "#cbd5e1",
                background: active ? "#2563eb" : "transparent",
                fontWeight: active ? 600 : 400,
                fontSize: 14,
                textDecoration: "none",
                borderLeft: active ? "3px solid #60a5fa" : "3px solid transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #1e293b",
          fontSize: 12,
          color: "#94a3b8",
        }}
      >
        <div style={{ marginBottom: 8, wordBreak: "break-all" }}>{adminEmail}</div>
        <Link
          href="/dashboard"
          style={{ color: "#60a5fa", textDecoration: "none", fontSize: 12 }}
        >
          ← ダッシュボードへ
        </Link>
        <div style={{ marginTop: 8 }}>
          <Link
            href="/api/auth/logout"
            style={{ color: "#94a3b8", textDecoration: "none", fontSize: 12 }}
          >
            ログアウト
          </Link>
        </div>
      </div>
    </aside>
  );
}
