import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ai_news_session";

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return false;
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return result.payload.sub === "single-user" && result.payload.role === "owner";
  } catch {
    return false;
  }
}

function isWorkerBoundary(pathname: string) {
  return pathname.startsWith("/api/worker/") || pathname.startsWith("/api/jobs/") ||
    pathname === "/api/automation/daily";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth/login" || isWorkerBoundary(pathname)) {
    return NextResponse.next();
  }
  if (await hasValidSession(request)) {
    const response = NextResponse.next();
    if (pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon).*)"]
};
