import { z } from "zod";
import { completeDailyBoardJob } from "@/lib/daily-board-store";
import { requireWorker } from "@/lib/auth";
import { completeRunForBoard } from "@/lib/worker-store";

const bodySchema = z.object({
  items: z.array(z.object({
    contentLeadId: z.string().min(1),
    summaryTh: z.string().min(240).max(2400),
    confidenceLabel: z.enum(["high", "medium", "low"])
  })).max(10)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "invalid daily board output", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await completeDailyBoardJob(id, parsed.data.items);
  if (result?.collectionRunId) await completeRunForBoard(result.collectionRunId);
  return result
    ? Response.json(result)
    : Response.json({ error: "daily board job not found" }, { status: 404 });
}
