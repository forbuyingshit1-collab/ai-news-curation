import { restoreRejectedItem } from "@/lib/persistent-store";
import { requireApiSession } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  const { id } = await params;
  const lead = await restoreRejectedItem(id);

  if (!lead) {
    return Response.json({ error: "rejected item not found" }, { status: 404 });
  }

  return Response.json(lead, { status: 201 });
}
