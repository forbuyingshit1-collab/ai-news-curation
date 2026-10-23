import type { LeadFeedbackValue } from "@/lib/types";
import { recordLeadFeedback } from "@/lib/persistent-store";
import { requireApiSession } from "@/lib/auth";

const allowedFeedback = new Set<LeadFeedbackValue>([
  "interested",
  "not_relevant",
  "too_weak",
  "already_known"
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as { feedback?: unknown; note?: unknown };

  if (typeof body.feedback !== "string" || !allowedFeedback.has(body.feedback as LeadFeedbackValue)) {
    return Response.json({ error: "invalid feedback" }, { status: 400 });
  }

  const lead = await recordLeadFeedback(
    id,
    body.feedback as LeadFeedbackValue,
    typeof body.note === "string" ? body.note : undefined
  );

  if (!lead) {
    return Response.json({ error: "lead not found" }, { status: 404 });
  }

  return Response.json(lead);
}
