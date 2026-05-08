import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";

export const dynamic = "force-dynamic";

const VALID_PLANS = Object.keys(PLANS);
const VALID_ROLES = ["user", "admin"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      plan: true,
      role: true,
      scansThisMonth: true,
      usageResetAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      stripeCurrentPeriodEnd: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const [scansCount, findingsCount] = await Promise.all([
    prisma.scan.count({ where: { userId: user.id } }),
    prisma.scanFinding.count({
      where: { scan: { userId: user.id } },
    }),
  ]);

  return NextResponse.json({ user, scansCount, findingsCount });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const data: { plan?: string; role?: string } = {};
  if (body.plan !== undefined) {
    if (!VALID_PLANS.includes(body.plan)) {
      return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });
    }
    data.plan = body.plan;
  }
  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
    }
    data.role = body.role;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "NO_FIELDS" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      email: true,
      plan: true,
      role: true,
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (admin.id === params.id) {
    return NextResponse.json(
      { error: "CANNOT_DELETE_SELF" },
      { status: 400 }
    );
  }

  try {
    await prisma.user.delete({ where: { id: params.id } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "DELETE_FAILED", detail: e?.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
