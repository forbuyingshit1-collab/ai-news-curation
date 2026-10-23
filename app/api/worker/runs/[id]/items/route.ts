import { requireWorker } from "@/lib/auth";
import { getRunEnrichmentItems } from "@/lib/worker-store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await context.params;
  return Response.json({ items: await getRunEnrichmentItems(id) });
}
