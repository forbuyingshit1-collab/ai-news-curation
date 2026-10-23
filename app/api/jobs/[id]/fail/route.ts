import { z } from "zod";
import { requireWorker } from "@/lib/auth";
import { failWorkerJob } from "@/lib/worker-store";

const bodySchema = z.object({ error: z.string().min(1).max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "error message is required" }, { status: 400 });
  }

  const result = await failWorkerJob(id, parsed.data.error);
  return result
    ? Response.json(result)
    : Response.json({ error: "daily board job not found" }, { status: 404 });
}
