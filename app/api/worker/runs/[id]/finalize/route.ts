import { requireWorker } from "@/lib/auth";
import { finalizeRun } from "@/lib/worker-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await context.params;
  return Response.json(await finalizeRun(id));
}
