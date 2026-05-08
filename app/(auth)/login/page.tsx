"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";

const PRIMARY = "#2563eb";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "ログインに失敗しました");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          color: "#1e3a8a",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        <img src="/sequlia-icon.png" width={24} height={24} alt="Sequlia" />
        <span>Sequlia</span>
      </Link>

      <div
        style={{
          width: 420,
          maxWidth: "100%",
          margin: "0 auto",
          background: "#fff",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <img src="/sequlia-icon.png" width={48} height={48} alt="Sequlia" />
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Sequlia</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>アカウントにログイン</div>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>メールアドレス</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>パスワード</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>

          {error && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, textAlign: "center" }}>
          <Link href="/signup" style={{ color: PRIMARY, textDecoration: "none" }}>
            アカウントをお持ちでない方
          </Link>
          <Link href="/forgot-password" style={{ color: "#64748b", textDecoration: "none" }}>
            パスワードをお忘れの方
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};
