import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
  );

  const where: Record<string, unknown> = {};
  if (q) where.url = { contains: q, mode: "insensitive" };
  if (status && ["queued", "running", "completed", "failed"].includes(status)) {
    where.status = status;
  }

  const [total, scansRaw] = await Promise.all([
    prisma.scan.count({ where }),
    prisma.scan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        url: true,
        status: true,
        progress: true,
        riskScore: true,
        totalChecks: true,
        doneChecks: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  const scans = scansRaw.map((s) => ({
    id: s.id,
    userId: s.userId,
    userEmail: s.user?.email ?? null,
    url: s.url,
    status: s.status,
    progress: s.progress,
    riskScore: s.riskScore,
    totalChecks: s.totalChecks,
    doneChecks: s.doneChecks,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    createdAt: s.createdAt,
  }));

  return NextResponse.json({
    scans,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
