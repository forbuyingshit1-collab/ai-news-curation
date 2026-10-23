import { expandLead } from "@/lib/persistent-store";
import { requireApiSession } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  const { id } = await params;
  const expansion = await expandLead(id);

  if (!expansion) {
    return Response.json({ error: "lead not found" }, { status: 404 });
  }

  return Response.json(expansion, { status: 201 });
}
