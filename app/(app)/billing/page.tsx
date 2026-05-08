import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPlan, type PlanId } from "@/lib/plans";
import { PortalButton } from "./PortalButton";

export const dynamic = "force-dynamic";

function fmtJPY(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function statusFromUser(user: {
  plan: string;
  stripeCurrentPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
}): { label: string; tone: "active" | "warn" | "muted" } {
  if (user.plan === "free") return { label: "無料プラン", tone: "muted" };
  if (!user.stripeSubscriptionId) return { label: "未契約", tone: "muted" };
  if (
    user.stripeCurrentPeriodEnd &&
    new Date(user.stripeCurrentPeriodEnd).getTime() < Date.now()
  ) {
    return { label: "期限切れ", tone: "warn" };
  }
  return { label: "アクティブ", tone: "active" };
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { success?: string; canceled?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/billing");

  const plan = getPlan(user.plan as PlanId);
  const status = statusFromUser({
    plan: user.plan,
    stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
    stripeSubscriptionId: user.stripeSubscriptionId,
  });

  const limit = plan.limits.scansPerMonth;
  const used = user.scansThisMonth ?? 0;
  const limitLabel = limit === -1 ? "無制限" : `${limit}回`;
  const usagePct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)",
    border: "1px solid #e5e7eb",
    padding: 24,
  };

  const toneColors: Record<string, { bg: string; fg: string }> = {
    active: { bg: "#dcfce7", fg: "#15803d" },
    warn: { bg: "#fef3c7", fg: "#b45309" },
    muted: { bg: "#f1f5f9", fg: "#475569" },
  };
  const toneColor = toneColors[status.tone];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
          ご利用プランとお支払い
        </h1>
        <p style={{ color: "#64748b", marginTop: 6 }}>
          現在のプラン、ご利用状況、お支払い情報を管理できます。
        </p>
      </header>

      {searchParams?.success === "1" && (
        <div
          style={{
            ...cardStyle,
            padding: 14,
            marginBottom: 16,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#047857",
          }}
        >
          お支払いが完了しました。プランを反映しています。
        </div>
      )}
      {searchParams?.canceled === "1" && (
        <div
          style={{
            ...cardStyle,
            padding: 14,
            marginBottom: 16,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
          }}
        >
          お支払いはキャンセルされました。
        </div>
      )}

      {/* Current plan card */}
      <section style={{ ...cardStyle, marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
              現在のプラン
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                {plan.name}
              </h2>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: toneColor.bg,
                  color: toneColor.fg,
                }}
              >
                {status.label}
              </span>
            </div>
            <div style={{ marginTop: 6, color: "#475569" }}>
              {plan.price === 0
                ? plan.id === "enterprise"
                  ? "お問い合わせください"
                  : "無料"
                : `${fmtJPY(plan.price)} / 月`}
            </div>
            {user.stripeCurrentPeriodEnd && user.plan !== "free" && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>
                次回更新日: {fmtDate(user.stripeCurrentPeriodEnd)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {user.plan === "free" ? (
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  background: "#2563eb",
                  color: "#fff",
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 1px 2px rgba(37, 99, 235, 0.4)",
                }}
              >
                プランを選ぶ
              </Link>
            ) : (
              <>
                <Link
                  href="/pricing"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    background: "#2563eb",
                    color: "#fff",
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  プラン変更
                </Link>
                <PortalButton />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Usage card */}
      <section style={{ ...cardStyle, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          今月のご利用状況
        </h3>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#475569" }}>スキャン回数</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>
            {used} / {limitLabel}
          </span>
        </div>
        {limit > 0 && (
          <div
            style={{
              width: "100%",
              height: 8,
              background: "#e5e7eb",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${usagePct}%`,
                height: "100%",
                background: usagePct >= 90 ? "#ef4444" : "#2563eb",
                transition: "width 200ms",
              }}
            />
          </div>
        )}
      </section>

      {/* Plan features */}
      <section style={{ ...cardStyle, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          プランの内容
        </h3>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {plan.features.map((f) => (
            <li
              key={f}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "6px 0",
                color: "#334155",
              }}
            >
              <span style={{ color: "#2563eb", fontWeight: 700 }}>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invoices placeholder */}
      <section style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
          請求履歴
        </h3>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          請求履歴やインボイスのダウンロードは Stripe カスタマーポータルからご利用いただけます。
        </p>
        {user.stripeCustomerId && <div style={{ marginTop: 12 }}><PortalButton>請求履歴を表示</PortalButton></div>}
      </section>
    </div>
  );
}
