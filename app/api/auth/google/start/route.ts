import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth未設定" }, { status: 500 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from") ?? "/dashboard";
  const planParam = url.searchParams.get("plan") ?? "";

  const state = crypto.randomBytes(16).toString("hex");
  // Persist state + post-login redirect into a short-lived cookie
  const statePayload = JSON.stringify({ s: state, from: fromParam, plan: planParam });
  cookies().set("oauth_state", statePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });

  const baseUrl = process.env.APP_BASE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
