import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
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

/**
 * Build a public-facing absolute base URL.
 * Priority:
 *   1. process.env.APP_BASE_URL  (always trust if set)
 *   2. x-forwarded-host + x-forwarded-proto headers (Fly.io edge sets these)
 *   3. host header
 * Avoids using req.url which on Fly.io contains "0.0.0.0:3000" (internal binding).
 */
function publicBaseUrl(): string {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv && fromEnv.startsWith("http")) return fromEnv.replace(/\/$/, "");
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(`${publicBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectTo(`/login?error=${encodeURIComponent(error)}`);
  }
  if (!code || !stateFromQuery) {
    return redirectTo("/login?error=missing_code");
  }

  // Validate state
  const stateCookie = cookies().get("oauth_state")?.value;
  if (!stateCookie) {
    return redirectTo("/login?error=missing_state");
  }
  let parsed: { s: string; from: string; plan: string };
  try {
    parsed = JSON.parse(stateCookie);
  } catch {
    return redirectTo("/login?error=bad_state");
  }
  if (parsed.s !== stateFromQuery) {
    return redirectTo("/login?error=state_mismatch");
  }
  cookies().delete("oauth_state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectTo("/login?error=oauth_not_configured");
  }

  const baseUrl = publicBaseUrl();
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
      return redirectTo("/login?error=token_exchange");
    }
    tokens = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (e) {
    console.error("[google/callback] token error:", e);
    return redirectTo("/login?error=token_exchange");
  }

  // Fetch userinfo
  let userInfo: GoogleUserInfo;
  try {
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) {
      return redirectTo("/login?error=userinfo");
    }
    userInfo = (await infoRes.json()) as GoogleUserInfo;
  } catch (e) {
    console.error("[google/callback] userinfo error:", e);
    return redirectTo("/login?error=userinfo");
  }

  if (!userInfo.email) {
    return redirectTo("/login?error=no_email");
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
    user = await prisma.user.update({
      where: { id: user.id },
      data: { image: userInfo.picture, emailVerified: user.emailVerified ?? (userInfo.email_verified ? new Date() : null) },
    });
  }

  const token = signSession({ userId: user.id, email: user.email });
  setSessionCookie(token);

  // If a plan is requested (from /pricing flow), redirect to checkout
  if (parsed.plan === "standard" || parsed.plan === "pro") {
    return redirectTo(`/billing?initiate=${parsed.plan}`);
  }

  const fromPath = parsed.from && parsed.from.startsWith("/") ? parsed.from : "/dashboard";
  return redirectTo(fromPath);
}
