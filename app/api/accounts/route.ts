import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/accounts — TestAccount一覧
export async function GET() {
  try {
    const accounts = await prisma.testAccount.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(accounts);
  } catch (e) {
    console.error("[api/accounts GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/accounts — TestAccount作成
export async function POST(request: Request) {
  try {
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
