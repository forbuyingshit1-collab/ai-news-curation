import { runScheduledCollection } from "@/lib/collection-service";
import { requireWorker } from "@/lib/auth";

export async function POST(request: Request) {
  const denied = requireWorker(request);
  if (denied) return denied;
  try {
    return Response.json(await runScheduledCollection());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "scheduled collection failed" },
      { status: 500 }
    );
  }
}
