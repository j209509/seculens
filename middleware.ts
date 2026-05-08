import { NextRequest, NextResponse } from "next/server";

const PROTECTED = [
  "/dashboard",
  "/scan",
  "/results",
  "/history",
  "/settings",
  "/billing",
  "/accounts",
  "/compliance",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get("sequlia_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|.*\\.png|.*\\.svg).*)"],
};
