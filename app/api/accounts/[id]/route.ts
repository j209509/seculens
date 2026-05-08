import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
}

function planForbidden() {
  return NextResponse.json(
    { error: "この機能はProプラン以上が必要です" },
    { status: 403 }
  );
}

function planAllows(planId: string): boolean {
  const plan = PLANS[planId as PlanId] ?? PLANS.free;
  return plan.limits.authenticatedScans;
}

// DELETE /api/accounts/[id] — TestAccount削除（所有者のみ）
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return unauthorized();
    }

    if (!planAllows(user.plan)) return planForbidden();

    const existing = await prisma.testAccount.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (existing.userId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.testAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/accounts/[id] DELETE]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/accounts/[id] — TestAccount更新（所有者のみ）
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return unauthorized();
    }

    if (!planAllows(user.plan)) return planForbidden();

    const existing = await prisma.testAccount.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (existing.userId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, roleName, email, loginUrl, notes, isActive } = body as {
      name?: string;
      roleName?: string;
      email?: string;
      loginUrl?: string;
      notes?: string;
      isActive?: boolean;
    };

    const updated = await prisma.testAccount.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(roleName !== undefined && { roleName }),
        ...(email !== undefined && { email }),
        ...(loginUrl !== undefined && { loginUrl }),
        ...(notes !== undefined && { notes }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[api/accounts/[id] PATCH]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
