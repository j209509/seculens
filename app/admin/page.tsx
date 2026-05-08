import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  SignupsLineChart,
  ScansBarChart,
  PlanDistributionChart,
} from "@/components/admin/OverviewCharts";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
  padding: 20,
};

const planLabel: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  enterprise: "Enterprise",
};

const planBadgeStyle = (plan: string): React.CSSProperties => {
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

async function loadStats() {
  const [users, scans, activeSubscriptions, scansThisMonthAgg, byPlanRaw] =
    await Promise.all([
      prisma.user.count(),
      prisma.scan.count(),
      prisma.user.count({ where: { plan: { not: "free" } } }),
      prisma.user.aggregate({ _sum: { scansThisMonth: true } }),
      prisma.user.groupBy({ by: ["plan"], _count: { plan: true } }),
    ]);

  const byPlan = { free: 0, standard: 0, pro: 0, enterprise: 0 } as Record<
    string,
    number
  >;
  for (const row of byPlanRaw) {
    if (row.plan in byPlan) byPlan[row.plan] = row._count.plan;
  }

  const now = new Date();
  const start7 = new Date(now);
  start7.setDate(start7.getDate() - 6);
  start7.setHours(0, 0, 0, 0);

  const scans7 = await prisma.scan.findMany({
    where: { createdAt: { gte: start7 } },
    select: { createdAt: true },
  });
  const scanMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start7);
    d.setDate(start7.getDate() + i);
    scanMap.set(ymd(d), 0);
  }
  for (const s of scans7) {
    const k = ymd(s.createdAt);
    if (scanMap.has(k)) scanMap.set(k, (scanMap.get(k) || 0) + 1);
  }
  const scansLast7Days = Array.from(scanMap.entries()).map(([date, count]) => ({
    date: date.slice(5),
    count,
  }));

  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 29);
  start30.setHours(0, 0, 0, 0);
  const signups30 = await prisma.user.findMany({
    where: { createdAt: { gte: start30 } },
    select: { createdAt: true },
  });
  const signupMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(start30);
    d.setDate(start30.getDate() + i);
    signupMap.set(ymd(d), 0);
  }
  for (const u of signups30) {
    const k = ymd(u.createdAt);
    if (signupMap.has(k)) signupMap.set(k, (signupMap.get(k) || 0) + 1);
  }
  const signupsLast30Days = Array.from(signupMap.entries()).map(
    ([date, count]) => ({ date: date.slice(5), count })
  );

  const mrr = byPlan.standard * 4980 + byPlan.pro * 19800;

  const [recentSignups, recentScansRaw] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        createdAt: true,
      },
    }),
    prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        url: true,
        status: true,
        riskScore: true,
        userId: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  return {
    totals: {
      users,
      scans,
      activeSubscriptions,
      scansThisMonth: scansThisMonthAgg._sum.scansThisMonth ?? 0,
    },
    byPlan,
    scansLast7Days,
    signupsLast30Days,
    mrr,
    recent: { signups: recentSignups, scans: recentScansRaw },
  };
}

export default async function AdminOverviewPage() {
  const stats = await loadStats();

  const planChartData = (
    Object.keys(stats.byPlan) as Array<keyof typeof stats.byPlan>
  ).map((k) => ({ name: planLabel[k as string] || String(k), value: stats.byPlan[k] }));

  const fmtJpy = (n: number) => `¥${n.toLocaleString()}`;

  const KpiCard = ({
    label,
    value,
    sub,
  }: {
    label: string;
    value: string | number;
    sub?: string;
  }) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#0f172a",
          marginTop: 8,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );

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
        概要
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard label="総ユーザー数" value={stats.totals.users.toLocaleString()} />
        <KpiCard
          label="月間アクティブサブスク"
          value={stats.totals.activeSubscriptions.toLocaleString()}
          sub={`Free以外のユーザー`}
        />
        <KpiCard
          label="月間スキャン数"
          value={stats.totals.scansThisMonth.toLocaleString()}
          sub={`累計 ${stats.totals.scans.toLocaleString()} 件`}
        />
        <KpiCard label="MRR" value={fmtJpy(stats.mrr)} sub="月間定期収益" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 12,
            }}
          >
            新規登録（直近30日）
          </div>
          <SignupsLineChart data={stats.signupsLast30Days} />
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
            プラン分布
          </div>
          <PlanDistributionChart data={planChartData} />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            marginBottom: 12,
          }}
        >
          スキャン数（直近7日）
        </div>
        <ScansBarChart data={stats.scansLast7Days} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              marginBottom: 12,
            }}
          >
            最近の新規登録
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  メール
                </th>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  プラン
                </th>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  登録日
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.signups.map((u) => (
                <tr key={u.id}>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <Link
                      href={`/admin/users/${u.id}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {u.email}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={planBadgeStyle(u.plan)}>
                      {planLabel[u.plan] || u.plan}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                      color: "#64748b",
                    }}
                  >
                    {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
              {stats.recent.signups.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 16, color: "#94a3b8" }}>
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            最近のスキャン
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  URL
                </th>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  ステータス
                </th>
                <th style={{ padding: "8px 4px", borderBottom: "1px solid #e2e8f0" }}>
                  スコア
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.scans.map((s) => (
                <tr key={s.id}>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.url}
                  >
                    <Link
                      href={`/results/${s.id}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {s.url}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={statusBadge(s.status)}>{s.status}</span>
                  </td>
                  <td
                    style={{
                      padding: "8px 4px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {s.riskScore}
                  </td>
                </tr>
              ))}
              {stats.recent.scans.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 16, color: "#94a3b8" }}>
                    データがありません
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
