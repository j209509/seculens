import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  let user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  // ADMIN_EMAILS に含まれていれば role を admin に自動昇格
  if (user.role !== "admin" && isAdminEmail(user.email)) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = user;
  return NextResponse.json({ user: safe });
}

// DELETE /api/auth/me — current user削除（関連スキャン等もカスケード削除）
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    await prisma.user.delete({ where: { id: user.id } });
    clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/auth/me DELETE]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
