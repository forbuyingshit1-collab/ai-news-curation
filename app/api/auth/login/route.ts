import { cookies } from "next/headers";
import { z } from "zod";
import {
  createSessionToken, enforceRateLimit, requestAddress, SESSION_COOKIE,
  sessionCookieOptions, verifyPassword
} from "@/lib/auth";

const schema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  if (!await enforceRateLimit(`login:${requestAddress(request)}`, 8, 15 * 60)) {
    return Response.json({ error: "too many attempts" }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !await verifyPassword(parsed.data.password)) {
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return Response.json({ ok: true });
}
