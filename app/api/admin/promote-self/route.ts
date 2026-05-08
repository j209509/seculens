import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

// POST /api/admin/promote-self
// 管理者が自分自身を任意のプランに昇格（テスト用）
// Body: { plan: "free"|"standard"|"pro"|"enterprise" }
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const plan = body.plan;
    if (!["free", "standard", "pro", "enterprise"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const u = await prisma.user.update({
      where: { id: admin.id },
      data: { plan, role: "admin" },
    });
    return NextResponse.json({ ok: true, plan: u.plan, role: u.role });
  } catch (e) {
    console.error("[api/admin/promote-self]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
