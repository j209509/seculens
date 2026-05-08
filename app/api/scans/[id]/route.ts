import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/scans/[id] — スキャン詳細 + findings全件 + reportDrafts
// scan.userId が設定されている場合は所有者または admin のみ閲覧可。
// userId が null（ゲストスキャン = LPデモ）は誰でも閲覧可。
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scan = await prisma.scan.findUnique({
      where: { id: params.id },
      include: {
        findings: {
          orderBy: { createdAt: "desc" },
        },
        reportDrafts: true,
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    if (scan.userId) {
      const user = await getCurrentUser();
      const isOwner = user?.id === scan.userId;
      const isAdmin = user?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(scan);
  } catch (e) {
    console.error("[api/scans/[id] GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
