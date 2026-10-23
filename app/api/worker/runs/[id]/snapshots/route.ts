import { z } from "zod";
import { requireWorker } from "@/lib/auth";
import { saveSnapshots } from "@/lib/worker-store";

const snapshotSchema = z.object({
  rawItemId: z.string().min(1).max(200),
  status: z.enum(["succeeded", "failed"]),
  canonicalUrl: z.string().url().max(2000).optional(),
  extractionMethod: z.enum(["http", "playwright", "provider_excerpt"]).optional(),
  evidenceText: z.string().max(12000).optional(),
  claims: z.array(z.string().max(1000)).max(50).optional(),
  limitations: z.array(z.string().max(1000)).max(50).optional(),
  error: z.string().max(1000).optional()
}).superRefine((value, context) => {
  if (value.status === "succeeded" && (!value.canonicalUrl || !value.evidenceText?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "successful snapshot requires canonicalUrl and evidenceText" });
  }
});

const schema = z.object({ snapshots: z.array(snapshotSchema).max(100) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid snapshot payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id } = await context.params;
  return Response.json(await saveSnapshots(id, parsed.data.snapshots));
}
