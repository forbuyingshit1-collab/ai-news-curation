import { z } from "zod";
import { requireWorker } from "@/lib/auth";
import { heartbeat } from "@/lib/worker-store";

const schema = z.object({
  workerId: z.string().min(1).max(100),
  capabilities: z.array(z.string().min(1).max(100)).max(20).default([])
});

export async function POST(request: Request) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid heartbeat" }, { status: 400 });
  await heartbeat(parsed.data.workerId, parsed.data.capabilities);
  return Response.json({ ok: true });
}
