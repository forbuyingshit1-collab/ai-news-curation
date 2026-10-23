import { enforceRateLimit, requireApiSession } from "@/lib/auth";
import { retryProcessingRun } from "@/lib/persistent-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  if (!await enforceRateLimit("processing-retry", 10, 60 * 60)) {
    return Response.json({ error: "retry limit reached" }, { status: 429 });
  }
  const { id } = await context.params;
  const result = await retryProcessingRun(id);
  return result ? Response.json(result) : Response.json({ error: "processing run not found" }, { status: 404 });
}
