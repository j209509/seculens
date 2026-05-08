import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

// GET /api/scans/[id]/certificate-eligibility
// 各ティア(2/3/4)の発行可能性をチェック（プラン制限と発行条件の両方）
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
      tier2: { eligible: false, reason: "", planLocked: false },
      tier3: { eligible: false, reason: "", planLocked: false, current: 0, required: 1 },
      tier4: { eligible: false, reason: "", planLocked: false, current: 0, required: 2, daysSpan: 0, daysRequired: 31 },
    };

    if (scan.status !== "completed") {
      eligibility.tier2.reason = "スキャン未完了";
      return NextResponse.json(eligibility);
    }

    // ゲストスキャンは tier2 のみ
    if (!scan.userId) {
      eligibility.tier2.eligible = true;
      eligibility.tier3.reason = "ログインが必要";
      eligibility.tier3.planLocked = true;
      eligibility.tier4.reason = "ログインが必要";
      eligibility.tier4.planLocked = true;
      return NextResponse.json(eligibility);
    }

    const owner = await prisma.user.findUnique({ where: { id: scan.userId } });
    if (!owner) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    const isAdmin = owner.role === "admin" || isAdminEmail(owner.email);
    const planCfg = getPlan(owner.plan);
    const maxTier = isAdmin ? 4 : planCfg.limits.maxCertTier;

    // プラン制限チェック
    const planNote = (tier: number) =>
      maxTier === 0
        ? "有料プランで証明書発行が解禁されます"
        : `現在のプラン (${owner.plan}) では★${maxTier}までです。Proプランで★${tier}解禁`;

    // ティアごとに評価
    // ★2
    if (maxTier >= 2) {
      eligibility.tier2.eligible = true;
    } else {
      eligibility.tier2.planLocked = true;
      eligibility.tier2.reason = planNote(2);
    }

    // ★3
    const userScans = await prisma.scan.findMany({
      where: { userId: scan.userId, status: "completed" },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    });
    const count = userScans.length;
    const oldestAt = userScans[userScans.length - 1]?.completedAt;
    const daysSpan = oldestAt ? Math.floor((Date.now() - new Date(oldestAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    eligibility.tier3.current = count;
    if (maxTier < 3) {
      eligibility.tier3.planLocked = true;
      eligibility.tier3.reason = planNote(3);
    } else {
      eligibility.tier3.eligible = count >= 1;
      eligibility.tier3.reason = count >= 1 ? "" : "スキャン完了が必要";
    }

    // ★4
    eligibility.tier4.current = count;
    eligibility.tier4.daysSpan = daysSpan;
    if (maxTier < 4) {
      eligibility.tier4.planLocked = true;
      eligibility.tier4.reason = planNote(4);
    } else {
      eligibility.tier4.eligible = count >= 2 && daysSpan >= 31;
      if (!eligibility.tier4.eligible) {
        const parts = [];
        if (count < 2) parts.push(`あと${2 - count}回のスキャン`);
        if (daysSpan < 31) parts.push(`あと${31 - daysSpan}日の継続実績`);
        eligibility.tier4.reason = parts.join(" / ") + "が必要";
      }
    }

    return NextResponse.json(eligibility);
  } catch (e) {
    console.error("[api/scans/certificate-eligibility]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
