import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// DELETE /api/accounts/[id] — TestAccount削除
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.testAccount.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await prisma.testAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/accounts/[id] DELETE]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/accounts/[id] — TestAccount更新
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.testAccount.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
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
