import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/admin";
import { getPlan } from "@/lib/plans";
import { UserActions } from "@/components/admin/UserActions";

export const dynamic = "force-dynamic";

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

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
  textTransform: "uppercase",
};
const valueStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#0f172a",
  marginTop: 4,
  wordBreak: "break-all",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = await getAdminUser();
  // Layout already redirects if not admin, but we still need admin object for self-check
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      plan: true,
      role: true,
      scansThisMonth: true,
      usageResetAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      stripeCurrentPeriodEnd: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) notFound();

  const [scansCount, findingsCount, recentScans] = await Promise.all([
    prisma.scan.count({ where: { userId: user.id } }),
    prisma.scanFinding.count({ where: { scan: { userId: user.id } } }),
    prisma.scan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        url: true,
        status: true,
        riskScore: true,
        progress: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ]);

  const plan = getPlan(user.plan);
  const isSelf = admin?.id === user.id;

  function mask(v: string | null) {
    if (!v) return "-";
    if (v.length <= 8) return v;
    return v.slice(0, 6) + "..." + v.slice(-4);
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/admin/users"
          style={{ color: "#2563eb", textDecoration: "none", fontSize: 13 }}
        >
          ← ユーザー一覧
        </Link>
      </div>

      <div
        style={{
          ...cardStyle,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            style={{ width: 64, height: 64, borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {user.email.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
            {user.name || user.email}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {user.email}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <span style={planBadge(user.plan)}>
              {planLabel[user.plan] || user.plan}
            </span>
            <span
              style={{
                ...planBadge(user.role === "admin" ? "pro" : "free"),
                background: user.role === "admin" ? "#fee2e2" : "#f1f5f9",
                color: user.role === "admin" ? "#991b1b" : "#475569",
              }}
            >
              {user.role}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#64748b" }}>
          <div>
            登録: {new Date(user.createdAt).toLocaleDateString("ja-JP")}
          </div>
          <div>
            更新: {new Date(user.updatedAt).toLocaleDateString("ja-JP")}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 16,
            }}
          >
            プラン・利用状況
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            <div>
              <div style={labelStyle}>プラン</div>
              <div style={valueStyle}>{plan.name}</div>
            </div>
            <div>
              <div style={labelStyle}>月間上限</div>
              <div style={valueStyle}>
                {plan.limits.scansPerMonth === -1
                  ? "無制限"
                  : `${plan.limits.scansPerMonth} 回`}
              </div>
            </div>
            <div>
              <div style={labelStyle}>当月のスキャン数</div>
              <div style={valueStyle}>{user.scansThisMonth}</div>
            </div>
            <div>
              <div style={labelStyle}>累計スキャン</div>
              <div style={valueStyle}>{scansCount}</div>
            </div>
            <div>
              <div style={labelStyle}>累計検出数</div>
              <div style={valueStyle}>{findingsCount}</div>
            </div>
            <div>
              <div style={labelStyle}>使用量リセット日</div>
              <div style={valueStyle}>
                {new Date(user.usageResetAt).toLocaleDateString("ja-JP")}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 16,
            }}
          >
            管理操作
          </div>
          <UserActions
            userId={user.id}
            initialPlan={user.plan}
            initialRole={user.role}
            isSelf={isSelf}
          />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            marginBottom: 16,
          }}
        >
          Stripe 情報
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          <div>
            <div style={labelStyle}>Customer ID</div>
            <div style={valueStyle}>{mask(user.stripeCustomerId)}</div>
          </div>
          <div>
            <div style={labelStyle}>Subscription ID</div>
            <div style={valueStyle}>{mask(user.stripeSubscriptionId)}</div>
          </div>
          <div>
            <div style={labelStyle}>Price ID</div>
            <div style={valueStyle}>{mask(user.stripePriceId)}</div>
          </div>
          <div>
            <div style={labelStyle}>現在の期間終了</div>
            <div style={valueStyle}>
              {user.stripeCurrentPeriodEnd
                ? new Date(user.stripeCurrentPeriodEnd).toLocaleString("ja-JP")
                : "-"}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            marginBottom: 12,
          }}
        >
          最近のスキャン（最新20件）
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", background: "#f8fafc" }}>
                <th style={{ padding: "10px 8px" }}>URL</th>
                <th style={{ padding: "10px 8px" }}>ステータス</th>
                <th style={{ padding: "10px 8px" }}>スコア</th>
                <th style={{ padding: "10px 8px" }}>進捗</th>
                <th style={{ padding: "10px 8px" }}>開始日時</th>
                <th style={{ padding: "10px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {recentScans.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td
                    style={{
                      padding: "10px 8px",
                      maxWidth: 320,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.url}
                  >
                    {s.url}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={statusBadge(s.status)}>{s.status}</span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{s.riskScore}</td>
                  <td style={{ padding: "10px 8px", color: "#64748b" }}>
                    {s.progress}%
                  </td>
                  <td style={{ padding: "10px 8px", color: "#64748b" }}>
                    {new Date(s.createdAt).toLocaleString("ja-JP")}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <Link
                      href={`/results/${s.id}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {recentScans.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 16, color: "#94a3b8" }}>
                    スキャン履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
