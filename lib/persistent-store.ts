import "server-only";

import { createHash } from "node:crypto";
import { getApiSourceStatus } from "@/lib/api-sources";
import { query, withTransaction } from "@/lib/db";
import type {
  ContentExpansion,
  ContentLead,
  DashboardState,
  EditorialPlaybook,
  EditorialPreference,
  LeadFeedbackValue,
  NormalizedSourceItem,
  ProcessingRun,
  RawItem,
  ReferenceLibraryItem,
  RejectedItem,
  Source,
  WorkerHeartbeat
} from "@/lib/types";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function iso(value: string | Date | null | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

function canonicalizeUrl(input: string) {
  const url = new URL(input);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function fingerprint(value: string) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

type LeadRow = {
  id: string;
  story_cluster_id: string;
  title: string;
  source_url: string;
  lead_brief_th: string;
  confidence_label: ContentLead["confidenceLabel"];
  audience_fit_score: number;
  content_potential_score: number;
  novelty_score: number;
  practical_value_score: number;
  confidence_score: number;
  ranking_score: number;
  why_it_matters_th: string;
  verify_next_th: string;
  created_at: string | Date;
  feedback: LeadFeedbackValue | null;
  expansion: ContentExpansion | null;
};

function mapLead(row: LeadRow): ContentLead {
  return {
    id: row.id,
    storyClusterId: row.story_cluster_id,
    title: row.title,
    sourceUrl: row.source_url,
    leadBriefTh: row.lead_brief_th,
    confidenceLabel: row.confidence_label,
    scores: {
      audienceFit: row.audience_fit_score,
      contentPotential: row.content_potential_score,
      novelty: row.novelty_score,
      practicalValue: row.practical_value_score,
      confidence: row.confidence_score,
      ranking: row.ranking_score
    },
    whyItMattersTh: row.why_it_matters_th,
    verifyNextTh: row.verify_next_th,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.feedback ? { feedback: row.feedback } : {}),
    ...(row.expansion ? { expansion: row.expansion } : {})
  };
}

async function getLeads() {
  const result = await query<LeadRow>(
    `select lead.*,
       feedback.feedback,
       case when expansion.id is null then null else jsonb_build_object(
         'id', expansion.id,
         'contentLeadId', expansion.content_lead_id,
         'summaryTh', expansion.summary_th,
         'keyFacts', expansion.key_facts,
         'sourceContext', expansion.source_context,
         'suggestedAnglesTh', expansion.suggested_angles_th,
         'possibleHooksTh', expansion.possible_hooks_th,
         'cautionsTh', expansion.cautions_th,
         'recommendedFormat', expansion.recommended_format,
         'createdAt', expansion.created_at
       ) end expansion
     from content_leads lead
     left join lateral (
       select value.feedback from lead_feedback value
       where value.content_lead_id = lead.id order by value.created_at desc limit 1
     ) feedback on true
     left join content_expansions expansion on expansion.content_lead_id = lead.id
     order by lead.ranking_score desc, lead.created_at desc`
  );
  return result.rows.map(mapLead);
}

async function getRejected() {
  const result = await query<{
    id: string; story_cluster_id: string; title: string; source_url: string;
    rejection_reason: string; rejected_at: string | Date;
  }>(`select * from rejected_items order by rejected_at desc`);
  return result.rows.map((row): RejectedItem => ({
    id: row.id,
    storyClusterId: row.story_cluster_id,
    title: row.title,
    sourceUrl: row.source_url,
    rejectionReason: row.rejection_reason,
    rejectedAt: new Date(row.rejected_at).toISOString()
  }));
}

async function getSources() {
  const result = await query<{
    id: string; type: Source["type"]; provider: Source["provider"] | null;
    name: string; trust_level: Source["trustLevel"]; enabled: boolean; status: Source["status"];
  }>(`select * from sources order by type, name`);
  const liveApiStatus = new Map(getApiSourceStatus().map((source) => [source.provider, source.status]));
  return result.rows.map((row): Source => ({
    id: row.id,
    type: row.type,
    ...(row.provider ? { provider: row.provider } : {}),
    name: row.name,
    trustLevel: row.trust_level,
    enabled: row.enabled,
    status: row.provider ? liveApiStatus.get(row.provider) ?? row.status : row.status
  }));
}

async function getPreferences() {
  const result = await query<{
    id: string; preference_type: string; description: string; evidence_count: number; last_seen_at: string | Date;
  }>(`select * from editorial_preferences order by last_seen_at desc`);
  return result.rows.map((row): EditorialPreference => ({
    id: row.id,
    preferenceType: row.preference_type,
    description: row.description,
    evidenceCount: row.evidence_count,
    lastSeenAt: new Date(row.last_seen_at).toISOString()
  }));
}

export async function getReferenceLibrary() {
  const result = await query<{
    id: string; source_name: string; source_url: string; kind: ReferenceLibraryItem["kind"];
    title: string; summary_th: string; observed_signals: string[]; usage_guidance_th: string[]; captured_at: string | Date;
  }>(`select * from reference_library_items order by source_name, captured_at desc`);
  return result.rows.map((row): ReferenceLibraryItem => ({
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    kind: row.kind,
    title: row.title,
    summaryTh: row.summary_th,
    observedSignals: row.observed_signals,
    usageGuidanceTh: row.usage_guidance_th,
    capturedAt: new Date(row.captured_at).toISOString()
  }));
}

async function getPlaybooks() {
  const result = await query<{
    id: string; source_name: string; sample_count: number; selection_signals: string[];
    useful_angles: string[]; audience_assumptions: string[]; guardrails: string[]; updated_at: string | Date;
  }>(`select * from editorial_playbooks order by source_name`);
  return result.rows.map((row): EditorialPlaybook => ({
    id: row.id,
    sourceName: row.source_name,
    sampleCount: row.sample_count,
    selectionSignals: row.selection_signals,
    usefulAngles: row.useful_angles,
    audienceAssumptions: row.audience_assumptions,
    guardrails: row.guardrails,
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}

export async function getProcessingRuns(limit = 20) {
  const result = await query<{
    id: string; run_date: string | Date; trigger: ProcessingRun["trigger"]; status: ProcessingRun["status"];
    stage: ProcessingRun["stage"]; partial: boolean; progress: Record<string, number>;
    summary: Record<string, unknown>; started_at: string | Date; updated_at: string | Date; completed_at: string | Date | null;
  }>(`select * from collection_runs order by started_at desc limit $1`, [limit]);
  return result.rows.map((row): ProcessingRun => ({
    id: row.id,
    runDate: new Date(row.run_date).toISOString().slice(0, 10),
    trigger: row.trigger,
    status: row.status,
    stage: row.stage,
    partial: row.partial,
    progress: row.progress,
    summary: row.summary,
    startedAt: new Date(row.started_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.completed_at ? { completedAt: new Date(row.completed_at).toISOString() } : {})
  }));
}

async function getWorkerHeartbeat() {
  const result = await query<{
    worker_id: string; status: string; capabilities: string[]; last_seen_at: string | Date;
  }>(`select worker_id, status, capabilities, last_seen_at from worker_heartbeats order by last_seen_at desc limit 1`);
  const row = result.rows[0];
  return row ? ({
    workerId: row.worker_id,
    status: row.status,
    capabilities: row.capabilities,
    lastSeenAt: new Date(row.last_seen_at).toISOString()
  } satisfies WorkerHeartbeat) : undefined;
}

export async function getDashboardState(): Promise<DashboardState> {
  const [leads, rejected, sources, editorialPreferences, referenceLibrary, editorialPlaybooks, processingRuns, workerHeartbeat] =
    await Promise.all([
      getLeads(), getRejected(), getSources(), getPreferences(), getReferenceLibrary(),
      getPlaybooks(), getProcessingRuns(), getWorkerHeartbeat()
    ]);
  return {
    dailyBoards: [], leads, rejected, sources, editorialPreferences,
    referenceLibrary, editorialPlaybooks, processingRuns, workerHeartbeat
  };
}

async function enqueueManualProcessing(rawItemIds: string[]) {
  return withTransaction(async (client) => {
    const run = await client.query<{ id: string }>(
      `insert into collection_runs (run_date, trigger, status, stage, progress)
       values ((now() at time zone 'Asia/Bangkok')::date,'manual','running','gmail_sync','{}'::jsonb)
       returning id`
    );
    const runId = run.rows[0].id;
    await client.query(
      `update raw_items set collection_run_id = $1, updated_at = now() where id = any($2::text[])`,
      [runId, rawItemIds]
    );
    await client.query(
      `insert into jobs (type, status, collection_run_id, payload)
       values ('process_collection','pending',$1,jsonb_build_object('collectionRunId',$1))`,
      [runId]
    );
    return { id: runId, stage: "gmail_sync" as const, status: "running" as const };
  });
}

export async function ingestApiItems(provider: NormalizedSourceItem["provider"], items: NormalizedSourceItem[], collectionRunId?: string) {
  let created = 0;
  let duplicates = 0;
  const sourceId = `src_api_${provider}`;
  for (const item of items) {
    const canonicalUrl = canonicalizeUrl(item.sourceUrl);
    const result = await query(
      `insert into raw_items (
         id, source_id, collection_run_id, source_url, canonical_url, title, author, publisher,
         published_at, short_excerpt, fingerprint, language, processing_status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_enrichment')
       on conflict (fingerprint) do nothing returning id`,
      [
        id("raw"), sourceId, collectionRunId ?? null, item.sourceUrl, canonicalUrl,
        item.title, item.author ?? null, item.publisher, item.publishedAt ?? null,
        item.shortExcerpt, fingerprint(canonicalUrl), item.language
      ]
    );
    if (result.rowCount) created += 1;
    else duplicates += 1;
  }
  return { created, rejected: 0, duplicates };
}

export async function submitManualUrl(input: string) {
  const canonicalUrl = canonicalizeUrl(input);
  const rawId = id("raw");
  const result = await query<{ id: string }>(
    `insert into raw_items (
       id, source_id, source_url, canonical_url, title, publisher, short_excerpt,
       fingerprint, language, processing_status
     ) values ($1,'src_manual',$2,$3,$4,$5,'',$6,'unknown','awaiting_enrichment')
     on conflict (fingerprint) do nothing returning id`,
    [rawId, input, canonicalUrl, new URL(canonicalUrl).hostname, new URL(canonicalUrl).hostname, fingerprint(canonicalUrl)]
  );
  const createdId = result.rows[0]?.id;
  if (!createdId) {
    const existing = await query<{ id: string; processing_status: RawItem["processingStatus"] }>(
      `select id, processing_status from raw_items where fingerprint = $1`, [fingerprint(canonicalUrl)]
    );
    return { status: "duplicate" as const, rawItemId: existing.rows[0].id, processingStatus: existing.rows[0].processing_status };
  }
  const processingRun = await enqueueManualProcessing([createdId]);
  return { status: "accepted" as const, rawItemId: createdId, processingStatus: "awaiting_enrichment" as const, processingRun };
}

export async function recordLeadFeedback(leadId: string, feedback: LeadFeedbackValue, note?: string) {
  const exists = await query(`select 1 from content_leads where id = $1`, [leadId]);
  if (!exists.rowCount) return null;
  await withTransaction(async (client) => {
    await client.query(
      `insert into lead_feedback (content_lead_id, feedback, note) values ($1,$2,$3)`,
      [leadId, feedback, note?.trim() || null]
    );
    if (feedback === "interested" || note?.trim()) {
      await client.query(
        `insert into editorial_preferences (id, preference_type, description, evidence_count)
         values ($1,$2,$3,1)`,
        [id("pref"), feedback === "interested" ? "interest_signal" : "note", note?.trim() || `Interested in content lead ${leadId}`]
      );
    }
  });
  return (await getLeads()).find((lead) => lead.id === leadId) ?? null;
}

export async function expandLead(leadId: string) {
  const leads = await getLeads();
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return null;
  if (lead.expansion) return lead.expansion;
  const expansion: ContentExpansion = {
    id: id("expansion"),
    contentLeadId: lead.id,
    summaryTh: `${lead.title} เป็น Content Lead ที่ผ่าน Codex Curation ควรเปิดต้นทางเพื่อตรวจรายละเอียดก่อนนำไปพัฒนาเป็นคอนเทนต์`,
    keyFacts: [`Source: ${lead.sourceUrl}`, `Confidence: ${lead.confidenceLabel}`],
    sourceContext: lead.leadBriefTh,
    suggestedAnglesTh: [lead.whyItMattersTh],
    possibleHooksTh: [],
    cautionsTh: lead.verifyNextTh,
    recommendedFormat: "source review",
    createdAt: new Date().toISOString()
  };
  await query(
    `insert into content_expansions (
       id, content_lead_id, summary_th, key_facts, source_context, suggested_angles_th,
       possible_hooks_th, cautions_th, recommended_format, created_at
     ) values ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
    [
      expansion.id, lead.id, expansion.summaryTh, JSON.stringify(expansion.keyFacts), expansion.sourceContext,
      JSON.stringify(expansion.suggestedAnglesTh), JSON.stringify(expansion.possibleHooksTh),
      expansion.cautionsTh, expansion.recommendedFormat, expansion.createdAt
    ]
  );
  return expansion;
}

export async function restoreRejectedItem(rejectedId: string) {
  const restored = await withTransaction(async (client) => {
    const result = await client.query<{ story_cluster_id: string }>(
      `delete from rejected_items where id = $1 returning story_cluster_id`, [rejectedId]
    );
    const row = result.rows[0];
    if (!row) return null;
    await client.query(
      `update raw_items item set processing_status = 'awaiting_curation', updated_at = now()
       from story_cluster_items member where member.story_cluster_id = $1 and member.raw_item_id = item.id`,
      [row.story_cluster_id]
    );
    const items = await client.query<{ id: string }>(
      `select raw_item_id id from story_cluster_items where story_cluster_id = $1`, [row.story_cluster_id]
    );
    await client.query(`delete from story_clusters where id = $1`, [row.story_cluster_id]);
    return { id: row.story_cluster_id, rawItemIds: items.rows.map((item) => item.id) };
  });
  if (!restored) return null;
  return { id: restored.id, status: "awaiting_curation" as const, processingRun: await enqueueManualProcessing(restored.rawItemIds) };
}

export async function retryProcessingRun(runId: string) {
  return withTransaction(async (client) => {
    const run = await client.query<{ id: string }>(
      `update collection_runs set status = 'running', stage = 'gmail_sync', partial = false,
       completed_at = null, updated_at = now() where id = $1 returning id`, [runId]
    );
    if (!run.rows[0]) return null;
    await client.query(
      `update raw_items set processing_status = 'awaiting_enrichment', failure_reason = null, updated_at = now()
       where collection_run_id = $1 and processing_status = 'failed'`, [runId]
    );
    const job = await client.query<{ id: string }>(
      `update jobs set status = 'pending', attempts = 0, last_error = null, available_at = now(), updated_at = now()
       where id = (select id from jobs where collection_run_id = $1 and type = 'process_collection'
         order by created_at desc limit 1) returning id`, [runId]
    );
    if (!job.rows[0]) {
      await client.query(
        `insert into jobs (type, status, collection_run_id, payload)
         values ('process_collection','pending',$1,jsonb_build_object('collectionRunId',$1))`, [runId]
      );
    }
    return { id: runId, status: "running" as const };
  });
}
