import { getReferenceLibrary } from "@/lib/persistent-store";
import { requireApiSession } from "@/lib/auth";

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  return Response.json(await getReferenceLibrary());
}
