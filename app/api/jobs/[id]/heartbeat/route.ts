import { requireWorker } from "@/lib/auth";
import { heartbeatWorkerJob } from "@/lib/worker-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await params;
  return Response.json({ ok: await heartbeatWorkerJob(id) });
}
