import { submitManualUrl } from "@/lib/persistent-store";
import { enforceRateLimit, requireApiSession } from "@/lib/auth";
import { validatePublicHttpUrl } from "@/lib/url-safety";

export async function POST(request: Request) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  if (!await enforceRateLimit("manual-url", 20, 60 * 60)) {
    return Response.json({ error: "manual URL limit reached" }, { status: 429 });
  }
  try {
    const body = (await request.json()) as { url?: unknown };

    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return Response.json({ error: "url is required" }, { status: 400 });
    }

    const result = await submitManualUrl(validatePublicHttpUrl(body.url.trim()));
    return Response.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof TypeError ? "invalid url" : "manual url intake failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
