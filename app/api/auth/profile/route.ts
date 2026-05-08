import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// PATCH /api/auth/profile — body: { name?: string }. Updates user.name only.
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
    };

    const data: { name?: string } = {};
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length > 100) {
        return NextResponse.json(
          { error: "名前は100文字以内で入力してください" },
          { status: 400 }
        );
      }
      data.name = trimmed;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _ph, ...safe } = updated;
    return NextResponse.json({ user: safe });
  } catch (e) {
    console.error("[api/auth/profile PATCH]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
