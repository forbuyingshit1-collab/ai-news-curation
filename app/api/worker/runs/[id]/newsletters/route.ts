import { z } from "zod";
import { requireWorker } from "@/lib/auth";
import { ingestNewsletterEditions } from "@/lib/worker-store";

const schema = z.object({ editions: z.array(z.object({
  gmailMessageId: z.string().min(1).max(500),
  gmailThreadId: z.string().max(500).optional(),
  sender: z.string().min(1).max(500),
  subject: z.string().min(1).max(1000),
  sentAt: z.string().datetime(),
  contentExcerpt: z.string().max(6000),
  ignored: z.boolean().optional(),
  stories: z.array(z.object({
    title: z.string().min(1).max(500),
    primaryUrl: z.string().url().max(2000).optional(),
    excerpt: z.string().max(6000).default(""),
    publishedAt: z.string().datetime().optional()
  })).max(30)
})).max(200) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    console.error("Invalid newsletter payload", parsed.error.issues.map((issue) => ({
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })));
    return Response.json({ error: "invalid newsletter payload" }, { status: 400 });
  }
  const { id } = await context.params;
  return Response.json(await ingestNewsletterEditions(id, parsed.data.editions));
}
