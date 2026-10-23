import { getApiSourceStatus } from "@/lib/api-sources";
import { collectApiNews, isApiProvider } from "@/lib/collection-service";
import { enforceRateLimit, requireApiSession } from "@/lib/auth";

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  return Response.json({ sources: getApiSourceStatus() });
}

export async function POST(request: Request) {
  const denied = await requireApiSession(request, { csrf: true });
  if (denied) return denied;
  if (!await enforceRateLimit("manual-collection", 6, 60 * 60)) {
    return Response.json({ error: "collection limit reached" }, { status: 429 });
  }
  try {
    const body = (await request.json()) as {
      providers?: unknown;
      query?: unknown;
      limit?: unknown;
    };
    const providers = Array.isArray(body.providers)
      ? body.providers.filter(isApiProvider)
      : undefined;
    const query = typeof body.query === "string" ? body.query : undefined;
    const limit = typeof body.limit === "number" ? body.limit : undefined;

    return Response.json(await collectApiNews({ providers, query, limit }));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "api ingestion failed" },
      { status: 400 }
    );
  }
}
