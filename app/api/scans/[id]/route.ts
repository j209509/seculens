import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/scans/[id] — スキャン詳細 + findings全件 + reportDrafts
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

    return NextResponse.json(scan);
  } catch (e) {
    console.error("[api/scans/[id] GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
