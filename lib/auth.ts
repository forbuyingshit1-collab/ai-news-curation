import "server-only";

import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withTransaction } from "@/lib/db";

export const SESSION_COOKIE = "ai_news_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function requiredEnv(name: "APP_PASSWORD_HASH" | "SESSION_SECRET" | "WORKER_TOKEN") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function secretKey() {
  return new TextEncoder().encode(requiredEnv("SESSION_SECRET"));
}

export async function verifyPassword(password: string) {
  if (!password || password.length > 256) return false;
  return bcrypt.compare(password, requiredEnv("APP_PASSWORD_HASH"));
}

export async function createSessionToken() {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("single-user")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  try {
    const result = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return result.payload.sub === "single-user" && result.payload.role === "owner";
  } catch {
    return false;
  }
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export async function hasRequestSession(request: Request) {
  return verifySessionToken(cookieValue(request, SESSION_COOKIE));
}

export async function requirePageSession() {
  const store = await cookies();
  if (!await verifySessionToken(store.get(SESSION_COOKIE)?.value)) redirect("/login");
}

export async function requireApiSession(request: Request, options: { csrf?: boolean } = {}) {
  if (!await hasRequestSession(request)) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  if (options.csrf && !isSameOrigin(request)) {
    return Response.json({ error: "invalid request origin" }, { status: 403 });
  }
  return null;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireWorker(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!constantTimeEqual(token, requiredEnv("WORKER_TOKEN"))) {
    return Response.json({ error: "worker authentication required" }, { status: 401 });
  }
  return null;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  return withTransaction(async (client) => {
    const result = await client.query<{ request_count: number }>(
      `insert into rate_limits (key, window_started_at, request_count)
       values ($1, now(), 1)
       on conflict (key) do update set
         window_started_at = case
           when rate_limits.window_started_at < now() - ($2 * interval '1 second') then now()
           else rate_limits.window_started_at end,
         request_count = case
           when rate_limits.window_started_at < now() - ($2 * interval '1 second') then 1
           else rate_limits.request_count + 1 end
       returning request_count`,
      [key, windowSeconds]
    );
    return result.rows[0].request_count <= limit;
  });
}

export function requestAddress(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};
