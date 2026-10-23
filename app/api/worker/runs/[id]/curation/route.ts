import { z } from "zod";
import { requireWorker } from "@/lib/auth";
import { applyCuration, getCurationInput } from "@/lib/worker-store";

const decisionSchema = z.object({
  rawItemIds: z.array(z.string().min(1).max(200)).min(1).max(20),
  disposition: z.enum(["lead", "rejected"]),
  title: z.string().min(1).max(500),
  leadBriefTh: z.string().min(1).max(3000),
  whyItMattersTh: z.string().min(1).max(2000),
  verifyNextTh: z.string().min(1).max(2000),
  rejectionReason: z.string().max(2000).optional(),
  confidenceLabel: z.enum(["high", "medium", "low"]),
  scores: z.object({
    audienceFit: z.number().min(0).max(100),
    contentPotential: z.number().min(0).max(100),
    novelty: z.number().min(0).max(100),
    practicalValue: z.number().min(0).max(100),
    confidence: z.number().min(0).max(100),
    ranking: z.number().min(0).max(100)
  }),
  topicTags: z.array(z.string().min(1).max(100)).max(20)
});

const schema = z.object({ decisions: z.array(decisionSchema).max(100) });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const { id } = await context.params;
  return Response.json(await getCurationInput(id));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid curation payload" }, { status: 400 });
  const { id } = await context.params;
  return Response.json(await applyCuration(id, parsed.data.decisions));
}
