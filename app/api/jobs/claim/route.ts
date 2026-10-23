import { requireWorker } from "@/lib/auth";
import { claimWorkerJob } from "@/lib/worker-store";

export async function POST(request: Request) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const job = await claimWorkerJob();
  return job ? Response.json(job) : new Response(null, { status: 204 });
}
