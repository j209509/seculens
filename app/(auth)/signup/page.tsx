"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent } from "react";

const PLAN_NAMES: Record<string, string> = {
  standard: "スタンダード",
  pro: "プロ",
};

const PRIMARY = "#2563eb";

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const planParam = sp.get("plan");
  const planTarget = planParam === "standard" || planParam === "pro" ? planParam : null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "登録に失敗しました");
        setLoading(false);
        return;
      }
      if (planTarget) {
        try {
          const co = await fetch("/api/stripe/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId: planTarget }),
          });
          if (co.ok) {
            const cd = await co.json();
            if (cd?.url) {
              window.location.href = cd.url;
              return;
            }
          }
        } catch {
          // fall through to dashboard
        }
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
          <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>無料アカウントを作成</div>
        </div>

        {planTarget && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 14,
              textAlign: "center",
            }}
          >
            <strong>{PLAN_NAMES[planTarget]}プラン</strong> を選択中：登録後、お支払い画面に進みます
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>お名前（任意）</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              style={inputStyle}
            />
          </label>
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
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>パスワード（8文字以上）</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>パスワード（確認）</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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
            }}
          >
            {loading ? "作成中..." : "アカウントを作成"}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 13, textAlign: "center" }}>
          <Link href="/login" style={{ color: PRIMARY, textDecoration: "none" }}>
            既にアカウントをお持ちの方はこちら
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
