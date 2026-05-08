"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent } from "react";

const PLAN_NAMES: Record<string, string> = {
  standard: "スタンダード",
  pro: "プロ",
};

const PRIMARY = "#2563eb";

export default function SignupForm() {
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

          <p style={{ marginTop: 12, fontSize: 11, lineHeight: 1.6, color: "#64748b", textAlign: "center" }}>
            登録することで、
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ color: PRIMARY, textDecoration: "underline" }}>利用規約</a>
            および
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: PRIMARY, textDecoration: "underline" }}>プライバシーポリシー</a>
            に同意したものとみなされます。
          </p>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          <span style={{ fontSize: 12, color: "#94a3b8" }}>または</span>
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        </div>

        <a
          href={`/api/auth/google/start${planTarget ? `?plan=${planTarget}` : ""}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#fff",
            color: "#0f172a",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Googleで登録
        </a>

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
