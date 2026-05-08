"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";

const PRIMARY = "#2563eb";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
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
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>パスワード再設定</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#64748b", textAlign: "center" }}>
            登録メールアドレスに再設定用リンクを送信します
          </div>
        </div>

        {sent ? (
          <div
            style={{
              background: "#ecfeff",
              border: "1px solid #a5f3fc",
              color: "#155e75",
              borderRadius: 10,
              padding: "14px 16px",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            メールを送信しました（実装中）
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>メールアドレス</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  outline: "none",
                  background: "#fff",
                  color: "#0f172a",
                }}
              />
            </label>
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
              }}
            >
              {loading ? "送信中..." : "再設定メールを送信"}
            </button>
          </form>
        )}

        <div style={{ marginTop: 20, fontSize: 13, textAlign: "center" }}>
          <Link href="/login" style={{ color: PRIMARY, textDecoration: "none" }}>
            ログインに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
