import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

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

  // scans last 7 days
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
    date,
    count,
  }));

  // signups last 30 days
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
    ([date, count]) => ({ date, count })
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

  const recentScans = recentScansRaw.map((s) => ({
    id: s.id,
    url: s.url,
    status: s.status,
    riskScore: s.riskScore,
    userId: s.userId,
    userEmail: s.user?.email ?? null,
    createdAt: s.createdAt,
  }));

  return NextResponse.json({
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
    recent: {
      signups: recentSignups,
      scans: recentScans,
    },
  });
}
