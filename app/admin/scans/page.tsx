"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type AdminScan = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  url: string;
  status: string;
  progress: number;
  riskScore: number;
  totalChecks: number;
  doneChecks: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  padding: 20,
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

const statusBadge = (s: string): React.CSSProperties => {
  const map: Record<string, { bg: string; fg: string }> = {
    queued: { bg: "#f1f5f9", fg: "#475569" },
    running: { bg: "#dbeafe", fg: "#1e40af" },
    completed: { bg: "#dcfce7", fg: "#166534" },
    failed: { bg: "#fee2e2", fg: "#991b1b" },
  };
  const c = map[s] || map.queued;
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

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export default function AdminScansPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    scans: AdminScan[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/scans?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

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
        スキャン管理
      </h1>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="URLで検索"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            style={{ ...inputStyle, minWidth: 280 }}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={inputStyle}
          >
            <option value="">全ステータス</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
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
              <tr
                style={{
                  textAlign: "left",
                  color: "#64748b",
                  background: "#f8fafc",
                }}
              >
                <th style={{ padding: "10px 8px" }}>URL</th>
                <th style={{ padding: "10px 8px" }}>ユーザー</th>
                <th style={{ padding: "10px 8px" }}>ステータス</th>
                <th style={{ padding: "10px 8px" }}>リスクスコア</th>
                <th style={{ padding: "10px 8px" }}>進捗</th>
                <th style={{ padding: "10px 8px" }}>開始日時</th>
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
              {data?.scans.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td
                    style={{ padding: "10px 8px", maxWidth: 280 }}
                    title={s.url}
                  >
                    {truncate(s.url, 50)}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {s.userId ? (
                      <Link
                        href={`/admin/users/${s.userId}`}
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {s.userEmail || s.userId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>ゲスト</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={statusBadge(s.status)}>{s.status}</span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{s.riskScore}</td>
                  <td style={{ padding: "10px 8px", color: "#64748b" }}>
                    {s.doneChecks}/{s.totalChecks} ({s.progress}%)
                  </td>
                  <td style={{ padding: "10px 8px", color: "#64748b" }}>
                    {new Date(s.createdAt).toLocaleString("ja-JP")}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <Link href={`/results/${s.id}`} style={buttonStyle}>
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {data && data.scans.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, color: "#94a3b8" }}>
                    該当するスキャンがありません
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
