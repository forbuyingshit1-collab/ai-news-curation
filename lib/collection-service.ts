import "server-only";

import { fetchApiSource } from "@/lib/api-sources";
import { bangkokDate } from "@/lib/daily-board-store";
import { query, withTransaction } from "@/lib/db";
import { ingestApiItems } from "@/lib/persistent-store";
import type { ApiProvider } from "@/lib/types";

export const API_PROVIDERS: ApiProvider[] = [
  "hacker_news", "dev_to", "newsdata", "the_news_api",
  "gdelt", "newsapi", "gnews", "mediastack"
];

export function isApiProvider(value: unknown): value is ApiProvider {
  return typeof value === "string" && API_PROVIDERS.includes(value as ApiProvider);
}

async function createRun(trigger: "manual" | "scheduled") {
  const result = await query<{ id: string }>(
    `insert into collection_runs (run_date, trigger, status, stage, progress)
     values ($1,$2,'running','api_collection','{}'::jsonb) returning id`,
    [bangkokDate(), trigger]
  );
  return result.rows[0].id;
}

export async function collectApiNews(options: {
  providers?: ApiProvider[];
  query?: string;
  limit?: number;
  trigger?: "manual" | "scheduled";
  collectionRunId?: string;
} = {}) {
  if (!options.collectionRunId) {
    const active = await query<{ id: string }>(
      `select id from collection_runs
       where run_date = $1 and status = 'running'
       order by started_at desc limit 1`,
      [bangkokDate()]
    );
    if (active.rows[0]) {
      throw new Error("A collection is already running. Wait for it to finish before starting another one.");
    }
  }
  const runId = options.collectionRunId ?? await createRun(options.trigger ?? "manual");
  const selectedProviders = options.providers ?? API_PROVIDERS;
  const fetched = await Promise.all(
    selectedProviders.map((provider) => fetchApiSource(provider, { query: options.query, limit: options.limit }))
  );
  const results = await Promise.all(
    fetched.map(async (result) => ({
      provider: result.provider,
      status: result.status,
      fetched: result.items.length,
      ...(result.status === "fetched" ? await ingestApiItems(result.provider, result.items, runId) : {}),
      ...(result.error ? { error: result.error } : {})
    }))
  );
  const totals = results.reduce(
    (total, result) => ({
      fetched: total.fetched + result.fetched,
      created: total.created + (result.created ?? 0),
      rejected: total.rejected + (result.rejected ?? 0),
      duplicates: total.duplicates + (result.duplicates ?? 0)
    }),
    { fetched: 0, created: 0, rejected: 0, duplicates: 0 }
  );

  await withTransaction(async (client) => {
    await client.query(
      `update collection_runs set stage = 'gmail_sync', progress = $2::jsonb,
       summary = jsonb_build_object('apiResults',$3::jsonb), updated_at = now() where id = $1`,
      [runId, JSON.stringify({ apiFetched: totals.fetched, rawItemsCreated: totals.created, duplicates: totals.duplicates }), JSON.stringify(results)]
    );
    await client.query(
      `insert into jobs (type, status, collection_run_id, payload)
       values ('process_collection','pending',$1,$2::jsonb)
       on conflict do nothing`,
      [runId, JSON.stringify({ collectionRunId: runId, boardDate: bangkokDate() })]
    );
  });

  return {
    query: options.query,
    results,
    totals,
    processingRun: { id: runId, stage: "gmail_sync" as const, status: "running" as const },
    boardJob: { status: "pending" as const, expectedCount: Math.min(10, totals.created) }
  };
}

export async function runScheduledCollection() {
  const boardDate = bangkokDate();
  const existing = await query<{ id: string }>(
    `select id from collection_runs where run_date = $1 and trigger = 'scheduled' limit 1`, [boardDate]
  );
  if (existing.rows[0]) return { alreadyRan: true, boardDate };
  try {
    const runId = await createRun("scheduled");
    return { alreadyRan: false, boardDate, ...(await collectApiNews({ trigger: "scheduled", collectionRunId: runId })) };
  } catch (error) {
    await query(
      `update collection_runs set status = 'failed', completed_at = now(), updated_at = now(),
       summary = jsonb_build_object('error',$2) where run_date = $1 and trigger = 'scheduled' and status = 'running'`,
      [boardDate, error instanceof Error ? error.message : "scheduled collection failed"]
    );
    throw error;
  }
}
