import { requireWorker } from "@/lib/auth";
import { completeWorkerJob } from "@/lib/worker-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await context.params;
  const job = await completeWorkerJob(id);
  return job ? Response.json(job) : Response.json({ error: "job not found" }, { status: 404 });
}
