import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/me/cert-status
// 現在のユーザーが取得済みの最上位ティアを返す（解約引き止め用）
export async function GET() {
  try {
    let user;
    try { user = await requireUser(); }
    catch { return NextResponse.json({ error: "ログインが必要です" }, { status: 401 }); }

    const userScans = await prisma.scan.findMany({
      where: { userId: user.id, status: "completed" },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    });
    const count = userScans.length;
    const oldestAt = userScans[userScans.length - 1]?.completedAt;
    const daysSpan = oldestAt ? Math.floor((Date.now() - new Date(oldestAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    let highestTier: 0 | 2 | 3 | 4 = 0;
    if (count >= 1) highestTier = 3; // ★3 は1回スキャンで取れる
    if (count >= 2 && daysSpan >= 60) highestTier = 4;

    return NextResponse.json({ highestTier, completedScans: count, daysSpan });
  } catch (e) {
    console.error("[api/me/cert-status]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
