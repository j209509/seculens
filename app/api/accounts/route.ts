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

// GET /api/accounts — TestAccount一覧（自分が所有するもののみ）
export async function GET() {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return unauthorized();
    }

    if (!planAllows(user.plan)) return planForbidden();

    const accounts = await prisma.testAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(accounts);
  } catch (e) {
    console.error("[api/accounts GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/accounts — TestAccount作成（自分のものとして）
export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await requireUser();
    } catch {
      return unauthorized();
    }

    if (!planAllows(user.plan)) return planForbidden();

    const body = await request.json();
    const { name, roleName, email, loginUrl, notes } = body as {
      name?: string;
      roleName?: string;
      email?: string;
      loginUrl?: string;
      notes?: string;
    };

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const account = await prisma.testAccount.create({
      data: {
        userId: user.id,
        name,
        roleName: roleName ?? "user",
        email,
        encryptedPassword: "", // パスワードは別途設定
        loginUrl: loginUrl ?? "",
        notes: notes ?? "",
        isActive: true,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (e) {
    console.error("[api/accounts POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
