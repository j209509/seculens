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
  const plan = searchParams.get("plan") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
  );

  const where: Record<string, unknown> = {};
  if (q) where.email = { contains: q, mode: "insensitive" };
  if (plan && ["free", "standard", "pro", "enterprise"].includes(plan)) {
    where.plan = plan;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        plan: true,
        role: true,
        scansThisMonth: true,
        usageResetAt: true,
        stripeCurrentPeriodEnd: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
