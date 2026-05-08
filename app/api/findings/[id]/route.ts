import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/findings/[id] — ScanFinding詳細 + reportDrafts
// 認可: 親スキャンの userId に基づきチェック。null (ゲスト) なら誰でも閲覧可。
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const finding = await prisma.scanFinding.findUnique({
      where: { id: params.id },
      include: {
        reportDrafts: true,
      },
    });

    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    const scan = await prisma.scan.findUnique({
      where: { id: finding.scanId },
      select: { userId: true },
    });

    if (scan?.userId) {
      const user = await getCurrentUser();
      const isOwner = user?.id === scan.userId;
      const isAdmin = user?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(finding);
  } catch (e) {
    console.error("[api/findings/[id] GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
