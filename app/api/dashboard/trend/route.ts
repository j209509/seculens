import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/dashboard/trend
// Returns last 6 months of scan and finding counts for the current user.
// Response: [{ month: "2026-05", scans: 12, vulnerabilities: 47 }, ...]
export async function GET() {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const now = new Date();
    const months: { year: number; month: number; key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${d.getMonth() + 1}月`,
      });
    }

    const earliest = new Date(months[0].year, months[0].month, 1);
    // 単一クエリで過去6ヶ月のスキャン+findings数を取得
    const scans = await prisma.scan.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: earliest },
      },
      select: {
        createdAt: true,
        _count: { select: { findings: true } },
      },
    });

    // 月別集計
    const buckets = new Map<string, { scans: number; vulnerabilities: number }>();
    for (const m of months) buckets.set(m.key, { scans: 0, vulnerabilities: 0 });

    for (const s of scans) {
      const key = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (b) {
        b.scans += 1;
        b.vulnerabilities += s._count.findings;
      }
    }

    const result = months.map((m) => ({
      month: m.label,
      scans: buckets.get(m.key)?.scans ?? 0,
      vulnerabilities: buckets.get(m.key)?.vulnerabilities ?? 0,
    }));

    return NextResponse.json({ trend: result });
  } catch (e) {
    console.error("[api/dashboard/trend GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
