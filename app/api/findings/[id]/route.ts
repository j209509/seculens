import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/findings/[id] — ScanFinding詳細 + reportDrafts
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

    return NextResponse.json(finding);
  } catch (e) {
    console.error("[api/findings/[id] GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
