import { cookies } from "next/headers";
import { requireApiSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
