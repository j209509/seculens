import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runFullScan } from "@/lib/scan-runner";

export const runtime = "nodejs";

// POST /api/scans — URLを受け取り、Scanを作成してバックグラウンドでスキャン開始
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // URL形式の簡易バリデーション
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const scan = await prisma.scan.create({
      data: {
        url,
        status: "queued",
        progress: 0,
        currentStep: "",
        totalChecks: 0,
        doneChecks: 0,
        riskScore: 0,
        error: "",
      },
    });

    // バックグラウンドでスキャン実行（awaitしない）
    runFullScan(scan.id, url).catch((e) =>
      console.error("[api/scans] runFullScan error:", e)
    );

    return NextResponse.json({ scanId: scan.id }, { status: 201 });
  } catch (e) {
    console.error("[api/scans POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/scans — 全スキャン一覧（最新50件）
export async function GET() {
  try {
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        findings: {
          select: { id: true, severity: true, type: true },
        },
        _count: {
          select: { findings: true },
        },
      },
    });

    return NextResponse.json(scans);
  } catch (e) {
    console.error("[api/scans GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
