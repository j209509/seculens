import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

// PATCH /api/auth/password — body: { currentPassword, newPassword }
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "新しいパスワードは8文字以上で入力してください" },
        { status: 400 }
      );
    }

    // OAuth-only users (no passwordHash) can set initial password without current.
    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "現在のパスワードを入力してください" },
          { status: 400 }
        );
      }
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "現在のパスワードが正しくありません" },
          { status: 400 }
        );
      }
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/auth/password PATCH]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
