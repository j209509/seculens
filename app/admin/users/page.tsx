"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: string;
  role: string;
  scansThisMonth: number;
  createdAt: string;
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  padding: 20,
};

const planLabel: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  enterprise: "Enterprise",
};

const planBadge = (plan: string): React.CSSProperties => {
  const map: Record<string, { bg: string; fg: string }> = {
    free: { bg: "#f1f5f9", fg: "#475569" },
    standard: { bg: "#dbeafe", fg: "#1e40af" },
    pro: { bg: "#ede9fe", fg: "#6d28d9" },
    enterprise: { bg: "#fef3c7", fg: "#92400e" },
  };
  const c = map[plan] || map.free;
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    background: c.bg,
    color: c.fg,
    fontSize: 11,
    fontWeight: 600,
  };
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #2563eb",
  borderRadius: 8,
  background: "#2563eb",
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    users: AdminUser[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (plan) params.set("plan", plan);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [q, plan, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#0f172a",
          marginBottom: 24,
        }}
      >
        ユーザー管理
      </h1>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="メールで検索"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            style={{ ...inputStyle, minWidth: 240 }}
          />
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
            style={inputStyle}
          >
            <option value="">全プラン</option>
            <option value="free">Free</option>
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <div style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>
            {data ? `${data.total} 件` : ""}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", background: "#f8fafc" }}>
                <th style={{ padding: "10px 8px" }}>メール</th>
                <th style={{ padding: "10px 8px" }}>名前</th>
                <th style={{ padding: "10px 8px" }}>プラン</th>
                <th style={{ padding: "10px 8px" }}>ロール</th>
                <th style={{ padding: "10px 8px" }}>月間スキャン</th>
                <th style={{ padding: "10px 8px" }}>登録日</th>
                <th style={{ padding: "10px 8px" }}>アクション</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, color: "#94a3b8" }}>
                    読み込み中...
                  </td>
                </tr>
              )}
              {data?.users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <Link
                      href={`/admin/users/${u.id}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {u.email}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#475569" }}>
                    {u.name || "-"}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={planBadge(u.plan)}>
                      {planLabel[u.plan] || u.plan}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        ...planBadge(u.role === "admin" ? "pro" : "free"),
                        background: u.role === "admin" ? "#fee2e2" : "#f1f5f9",
                        color: u.role === "admin" ? "#991b1b" : "#475569",
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#475569" }}>
                    {u.scansThisMonth}
                  </td>
                  <td style={{ padding: "10px 8px", color: "#64748b" }}>
                    {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <Link href={`/admin/users/${u.id}`} style={buttonStyle}>
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {data && data.users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, color: "#94a3b8" }}>
                    該当するユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 16,
            }}
          >
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              style={{
                ...buttonStyle,
                background: "#fff",
                color: "#2563eb",
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              ← 前へ
            </button>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {data.page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(data.totalPages, page + 1))}
              disabled={page >= data.totalPages}
              style={{
                ...buttonStyle,
                background: "#fff",
                color: "#2563eb",
                opacity: page >= data.totalPages ? 0.5 : 1,
              }}
            >
              次へ →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
