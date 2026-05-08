import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/scans/[id]/certificate-eligibility
// 各ティア(2/3/4)の発行可能性をチェック
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const scanId = params.id;
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: { id: true, userId: true, status: true },
    });
    if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (scan.userId) {
      const user = await getCurrentUser();
      if (!user || (user.id !== scan.userId && user.role !== "admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const eligibility = {
      tier2: { eligible: scan.status === "completed", reason: "" },
      tier3: { eligible: false, reason: "", current: 0, required: 1 },
      tier4: { eligible: false, reason: "", current: 0, required: 2, daysSpan: 0, daysRequired: 60 },
    };

    if (scan.status !== "completed") {
      eligibility.tier2.eligible = false;
      eligibility.tier2.reason = "スキャン未完了";
      return NextResponse.json(eligibility);
    }

    if (!scan.userId) {
      // ゲストスキャンは tier 2 のみ
      return NextResponse.json(eligibility);
    }

    const userScans = await prisma.scan.findMany({
      where: { userId: scan.userId, status: "completed" },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    });
    const count = userScans.length;
    const oldestAt = userScans[userScans.length - 1]?.completedAt;
    const daysSpan = oldestAt ? Math.floor((Date.now() - new Date(oldestAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    eligibility.tier3.current = count;
    eligibility.tier3.eligible = count >= 1;
    eligibility.tier3.reason = count >= 1 ? "" : "スキャン完了が必要";

    eligibility.tier4.current = count;
    eligibility.tier4.daysSpan = daysSpan;
    eligibility.tier4.eligible = count >= 2 && daysSpan >= 60;
    if (!eligibility.tier4.eligible) {
      const parts = [];
      if (count < 2) parts.push(`あと${2 - count}回のスキャン`);
      if (daysSpan < 60) parts.push(`あと${60 - daysSpan}日の継続実績`);
      eligibility.tier4.reason = parts.join(" / ") + "が必要";
    }

    return NextResponse.json(eligibility);
  } catch (e) {
    console.error("[api/scans/certificate-eligibility]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
