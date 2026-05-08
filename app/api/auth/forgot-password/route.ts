import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      // Always return ok to avoid leaking whether the user exists.
      return NextResponse.json({ ok: true });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt },
      });
      // TODO: send email with reset link containing `token`.
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    // Still return ok to avoid leaking error details / existence.
    return NextResponse.json({ ok: true });
  }
}
