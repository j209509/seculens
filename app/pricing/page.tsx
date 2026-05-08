"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS, type PlanId } from "@/lib/plans";
import { SiteFooter } from "@/components/SiteFooter";

const BRAND = "#2563eb";

function fmtJPY(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: "standard" | "pro") {
    setLoadingPlan(planId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (res.status === 401) {
        // Not logged in — send to signup carrying the plan choice.
        window.location.href = `/signup?plan=${planId}`;
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Checkout failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("No checkout URL");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoadingPlan(null);
    }
  }

  const planOrder: PlanId[] = ["free", "standard", "pro", "enterprise"];

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #ffffff 40%, #f8fafc 100%)",
        padding: "64px 24px",
      }}
    >
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <Link
          href="/"
          style={{
            color: "#64748b",
            textDecoration: "none",
            fontSize: 14,
            display: "inline-block",
            marginBottom: 16,
          }}
        >
          ← ホームに戻る
        </Link>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          プランと料金
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 16,
            color: "#475569",
            maxWidth: 640,
            margin: "12px auto 0",
          }}
        >
          無料から始めて、必要に応じてアップグレード。すべてのプランで主要な脆弱性診断機能をご利用いただけます。
        </p>
      </div>

      {error && (
        <div
          style={{
            maxWidth: 720,
            margin: "24px auto 0",
            padding: 12,
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div
        style={{
          maxWidth: 1280,
          margin: "48px auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          alignItems: "stretch",
        }}
      >
        {planOrder.map((id) => {
          const p = PLANS[id];
          const isPro = id === "pro";
          const isEnterprise = id === "enterprise";
          const isFree = id === "free";

          return (
            <div
              key={id}
              style={{
                position: "relative",
                background: "#fff",
                borderRadius: 16,
                border: isPro ? `2px solid ${BRAND}` : "1px solid #e5e7eb",
                boxShadow: isPro
                  ? "0 12px 32px rgba(37, 99, 235, 0.15)"
                  : "0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)",
                padding: 28,
                display: "flex",
                flexDirection: "column",
                minWidth: 260,
                maxWidth: 320,
                margin: "0 auto",
                width: "100%",
              }}
            >
              {isPro && (
                <span
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: BRAND,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 12px",
                    borderRadius: 999,
                    boxShadow: "0 2px 6px rgba(37, 99, 235, 0.4)",
                  }}
                >
                  人気
                </span>
              )}

              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                {p.name}
              </h3>

              <div style={{ marginBottom: 20 }}>
                {isEnterprise ? (
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
                    お問い合わせ
                  </div>
                ) : (
                  <>
                    <span
                      style={{ fontSize: 32, fontWeight: 800, color: "#0f172a" }}
                    >
                      {fmtJPY(p.price)}
                    </span>
                    <span style={{ fontSize: 14, color: "#64748b" }}> / 月</span>
                  </>
                )}
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  flex: 1,
                  marginBottom: 20,
                }}
              >
                {p.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "5px 0",
                      color: "#334155",
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: BRAND, fontWeight: 700 }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isFree && (
                <Link
                  href="/signup"
                  style={ctaStyle({ primary: false })}
                >
                  無料で始める
                </Link>
              )}
              {(id === "standard" || id === "pro") && (
                <button
                  type="button"
                  onClick={() => startCheckout(id)}
                  disabled={loadingPlan === id}
                  style={{
                    ...ctaStyle({ primary: isPro }),
                    cursor: loadingPlan === id ? "wait" : "pointer",
                    opacity: loadingPlan === id ? 0.7 : 1,
                  }}
                >
                  {loadingPlan === id ? "読み込み中…" : "このプランにする"}
                </button>
              )}
              {isEnterprise && (
                <a
                  href="mailto:contact@sequlia.com"
                  style={ctaStyle({ primary: false })}
                >
                  お問い合わせ
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <section
        style={{ maxWidth: 720, margin: "72px auto 0", padding: "0 8px" }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#0f172a",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          よくあるご質問
        </h2>
        {[
          {
            q: "プランはいつでも変更できますか?",
            a: "はい。アップグレード・ダウングレードはいつでも可能です。日割り計算で差額が請求されます。",
          },
          {
            q: "解約方法を教えてください",
            a: "「お支払い」ページの「支払い情報を管理」から、いつでもご解約いただけます。期間終了まではご利用いただけます。",
          },
          {
            q: "支払い方法は?",
            a: "Stripe を通じてクレジットカード(Visa / Mastercard / JCB / AMEX)でお支払いいただけます。",
          },
          {
            q: "請求書払いは可能ですか?",
            a: "Enterprise プランでは請求書払いに対応可能です。お問い合わせください。",
          },
        ].map((item) => (
          <details
            key={item.q}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 10,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: "#0f172a",
                listStyle: "none",
              }}
            >
              {item.q}
            </summary>
            <p style={{ marginTop: 10, color: "#475569", lineHeight: 1.7 }}>
              {item.a}
            </p>
          </details>
        ))}
      </section>
      <SiteFooter />
    </main>
  );
}

function ctaStyle({ primary }: { primary: boolean }): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "12px 18px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? BRAND : "#fff",
    color: primary ? "#fff" : "#0f172a",
    boxShadow: primary ? "0 2px 6px rgba(37, 99, 235, 0.35)" : "none",
    transition: "transform 120ms, box-shadow 120ms",
  };
}
