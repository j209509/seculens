import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !stateFromQuery) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  // Validate state
  const stateCookie = cookies().get("oauth_state")?.value;
  if (!stateCookie) {
    return NextResponse.redirect(new URL("/login?error=missing_state", req.url));
  }
  let parsed: { s: string; from: string; plan: string };
  try {
    parsed = JSON.parse(stateCookie);
  } catch {
    return NextResponse.redirect(new URL("/login?error=bad_state", req.url));
  }
  if (parsed.s !== stateFromQuery) {
    return NextResponse.redirect(new URL("/login?error=state_mismatch", req.url));
  }
  cookies().delete("oauth_state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", req.url));
  }

  const baseUrl = process.env.APP_BASE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // Exchange code for tokens
  let tokens: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("[google/callback] token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/login?error=token_exchange", req.url));
    }
    tokens = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (e) {
    console.error("[google/callback] token error:", e);
    return NextResponse.redirect(new URL("/login?error=token_exchange", req.url));
  }

  // Fetch userinfo
  let userInfo: GoogleUserInfo;
  try {
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) {
      return NextResponse.redirect(new URL("/login?error=userinfo", req.url));
    }
    userInfo = (await infoRes.json()) as GoogleUserInfo;
  } catch (e) {
    console.error("[google/callback] userinfo error:", e);
    return NextResponse.redirect(new URL("/login?error=userinfo", req.url));
  }

  if (!userInfo.email) {
    return NextResponse.redirect(new URL("/login?error=no_email", req.url));
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email: userInfo.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userInfo.email,
        name: userInfo.name ?? null,
        image: userInfo.picture ?? null,
        emailVerified: userInfo.email_verified ? new Date() : null,
        plan: "free",
      },
    });
  } else if (!user.image && userInfo.picture) {
    // Lazily backfill image
    user = await prisma.user.update({
      where: { id: user.id },
      data: { image: userInfo.picture, emailVerified: user.emailVerified ?? (userInfo.email_verified ? new Date() : null) },
    });
  }

  const token = signSession({ userId: user.id, email: user.email });
  setSessionCookie(token);

  // If a plan is requested (from /pricing flow), redirect to checkout
  if (parsed.plan === "standard" || parsed.plan === "pro") {
    return NextResponse.redirect(new URL(`/billing?initiate=${parsed.plan}`, req.url));
  }

  const fromPath = parsed.from && parsed.from.startsWith("/") ? parsed.from : "/dashboard";
  return NextResponse.redirect(new URL(fromPath, req.url));
}
