import "server-only";

import { createHash } from "node:crypto";
import { enqueueDailyBoardJob } from "@/lib/daily-board-store";
import { query, withTransaction } from "@/lib/db";
import { getDashboardState } from "@/lib/persistent-store";
import type { ConfidenceLabel, ProcessingStage } from "@/lib/types";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function heartbeat(workerId: string, capabilities: string[]) {
  await query(
    `insert into worker_heartbeats (worker_id, capabilities, status, last_seen_at)
     values ($1,$2::jsonb,'online',now())
     on conflict (worker_id) do update set capabilities = excluded.capabilities,
       status = 'online', last_seen_at = now()`,
    [workerId, JSON.stringify(capabilities)]
  );
}

export async function heartbeatWorkerJob(jobId: string) {
  const result = await query<{ id: string }>(
    `update jobs set updated_at = now()
     where id = $1 and status = 'running'
     returning id`,
    [jobId]
  );
  return Boolean(result.rows[0]);
}

export async function claimWorkerJob() {
  return withTransaction(async (client) => {
    await client.query(
      `update jobs set status = 'pending', updated_at = now(), last_error = 'worker lease expired'
       where status = 'running' and updated_at < now() - interval '3 minutes' and attempts < max_attempts`
    );
    await client.query(
      `update jobs set status = 'failed', updated_at = now(), last_error = 'worker lease expired after final retry'
       where status = 'running' and updated_at < now() - interval '3 minutes' and attempts >= max_attempts`
    );
    await client.query(
      `update collection_runs run set status = 'failed', completed_at = now(), updated_at = now(),
         summary = run.summary || jsonb_build_object('error', coalesce(job.last_error, 'worker job failed'))
       from jobs job
       where job.collection_run_id = run.id and job.type = 'process_collection'
         and job.status = 'failed' and run.status = 'running'`
    );
    const result = await client.query<{
      id: string; type: string; attempts: number; payload: Record<string, unknown>; collection_run_id: string | null;
    }>(
      `select id, type, attempts, payload, collection_run_id from jobs
       where status = 'pending' and attempts < max_attempts and available_at <= now()
       order by case type when 'process_collection' then 0 else 1 end, created_at
       limit 1 for update skip locked`
    );
    const job = result.rows[0];
    if (!job) return null;
    await client.query(`update jobs set status = 'running', attempts = attempts + 1, updated_at = now() where id = $1`, [job.id]);
    return { id: job.id, type: job.type, attempts: job.attempts + 1, payload: job.payload, collectionRunId: job.collection_run_id };
  });
}

export async function completeWorkerJob(jobId: string) {
  const result = await query<{ id: string }>(
    `update jobs set status = 'succeeded', last_error = null, updated_at = now()
     where id = $1 returning id`, [jobId]
  );
  return result.rows[0] ?? null;
}

export async function failWorkerJob(jobId: string, message: string) {
  return withTransaction(async (client) => {
    const result = await client.query<{
      status: "pending" | "failed"; type: string; collection_run_id: string | null;
    }>(
      `update jobs set
         status = case when attempts < max_attempts then 'pending' else 'failed' end,
         last_error = $2, updated_at = now(), available_at = now() + interval '30 seconds'
       where id = $1 returning status, type, collection_run_id`,
      [jobId, message.slice(0, 1000)]
    );
    const job = result.rows[0];
    if (job?.status === "failed" && job.type === "process_collection" && job.collection_run_id) {
      await client.query(
        `update collection_runs set status = 'failed', completed_at = now(), updated_at = now(),
           summary = summary || jsonb_build_object('error', $2)
         where id = $1 and status = 'running'`,
        [job.collection_run_id, message.slice(0, 1000)]
      );
    }
    return job ?? null;
  });
}

export async function updateRunStage(runId: string, stage: ProcessingStage, progress: Record<string, number> = {}) {
  await query(
    `update collection_runs set stage = $2, progress = progress || $3::jsonb, updated_at = now() where id = $1`,
    [runId, stage, JSON.stringify(progress)]
  );
}

export type NewsletterEditionInput = {
  gmailMessageId: string;
  gmailThreadId?: string;
  sender: string;
  subject: string;
  sentAt: string;
  contentExcerpt: string;
  ignored?: boolean;
  stories: Array<{
    title: string;
    primaryUrl?: string;
    excerpt: string;
    publishedAt?: string;
  }>;
};

export async function ingestNewsletterEditions(runId: string, editions: NewsletterEditionInput[]) {
  let editionCount = 0;
  let storyCount = 0;
  let duplicates = 0;
  await withTransaction(async (client) => {
    for (const edition of editions) {
      const inserted = await client.query<{ id: string }>(
        `insert into newsletter_editions (
           gmail_message_id, gmail_thread_id, sender, subject, sent_at, content_excerpt,
           status, collection_run_id
         ) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (gmail_message_id) do nothing returning id`,
        [
          edition.gmailMessageId, edition.gmailThreadId ?? null, edition.sender,
          edition.subject, edition.sentAt, edition.contentExcerpt.slice(0, 6000),
          edition.ignored ? "ignored" : "segmented", runId
        ]
      );
      const editionId = inserted.rows[0]?.id;
      if (!editionId) {
        duplicates += 1;
        continue;
      }
      editionCount += 1;
      if (edition.ignored) continue;
      for (const story of edition.stories) {
        const sourceUrl = story.primaryUrl || `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(edition.gmailMessageId)}`;
        const itemFingerprint = hash(story.primaryUrl?.toLowerCase() || `${edition.gmailMessageId}:${story.title.toLowerCase()}`);
        const rawId = id("raw");
        const raw = await client.query<{ id: string }>(
          `insert into raw_items (
             id, source_id, newsletter_edition_id, collection_run_id, source_url, canonical_url,
             title, publisher, published_at, short_excerpt, fingerprint, language, processing_status
           ) values ($1,'src_newsletter_gmail',$2,$3,$4,$5,$6,$7,$8,$9,$10,'en',$11)
           on conflict (fingerprint) do nothing returning id`,
          [
            rawId, editionId, runId, sourceUrl, story.primaryUrl ?? null, story.title,
            edition.sender, story.publishedAt ?? edition.sentAt, story.excerpt.slice(0, 6000),
            itemFingerprint, story.primaryUrl ? "awaiting_enrichment" : "awaiting_curation"
          ]
        );
        if (!raw.rows[0]) {
          duplicates += 1;
          continue;
        }
        storyCount += 1;
        if (!story.primaryUrl) {
          await client.query(
            `insert into source_snapshots (
               raw_item_id, canonical_url, extraction_method, evidence_text,
               evidence_char_count, content_hash, limitations
             ) values ($1,$2,'newsletter',$3,$4,$5,$6::jsonb)`,
            [rawId, sourceUrl, story.excerpt.slice(0, 6000), story.excerpt.slice(0, 6000).length, hash(story.excerpt), JSON.stringify(["No primary article URL in newsletter"])]
          );
        }
      }
    }
  });
  await updateRunStage(runId, "source_enrichment", { newsletterEditions: editionCount, newsletterStories: storyCount, duplicates });
  return { editionCount, storyCount, duplicates };
}

export async function getRunEnrichmentItems(runId: string) {
  const result = await query<{
    id: string; source_url: string; canonical_url: string | null; title: string; publisher: string; short_excerpt: string;
  }>(
    `select id, source_url, canonical_url, title, publisher, short_excerpt from raw_items
     where collection_run_id = $1 and processing_status = 'awaiting_enrichment'
     order by fetched_at`, [runId]
  );
  return result.rows.map((row) => ({
    id: row.id, sourceUrl: row.canonical_url ?? row.source_url, title: row.title,
    publisher: row.publisher, providerExcerpt: row.short_excerpt
  }));
}

export type SnapshotInput = {
  rawItemId: string;
  status: "succeeded" | "failed";
  canonicalUrl?: string;
  extractionMethod?: "http" | "playwright" | "provider_excerpt";
  evidenceText?: string;
  claims?: string[];
  limitations?: string[];
  error?: string;
};

export async function saveSnapshots(runId: string, snapshots: SnapshotInput[]) {
  let succeeded = 0;
  let failed = 0;
  await withTransaction(async (client) => {
    for (const snapshot of snapshots) {
      if (snapshot.status === "failed") {
        failed += 1;
        await client.query(
          `update raw_items set processing_status = 'failed', failure_reason = $3, updated_at = now()
           where id = $1 and collection_run_id = $2`,
          [snapshot.rawItemId, runId, (snapshot.error || "source enrichment failed").slice(0, 1000)]
        );
        continue;
      }
      const evidence = (snapshot.evidenceText || "").slice(0, 12000);
      if (!evidence) continue;
      succeeded += 1;
      await client.query(
        `insert into source_snapshots (
           raw_item_id, canonical_url, extraction_method, evidence_text, evidence_char_count,
           content_hash, claims, limitations
         ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
         on conflict (raw_item_id) do update set canonical_url = excluded.canonical_url,
           extraction_method = excluded.extraction_method, evidence_text = excluded.evidence_text,
           evidence_char_count = excluded.evidence_char_count, content_hash = excluded.content_hash,
           claims = excluded.claims, limitations = excluded.limitations, extracted_at = now(),
           expires_at = now() + interval '90 days'`,
        [
          snapshot.rawItemId, snapshot.canonicalUrl, snapshot.extractionMethod ?? "http",
          evidence, evidence.length, hash(evidence), JSON.stringify(snapshot.claims ?? []),
          JSON.stringify(snapshot.limitations ?? [])
        ]
      );
      await client.query(
        `update raw_items set canonical_url = coalesce($3, canonical_url), processing_status = 'awaiting_curation',
         failure_reason = null, updated_at = now() where id = $1 and collection_run_id = $2`,
        [snapshot.rawItemId, runId, snapshot.canonicalUrl ?? null]
      );
    }
  });
  await updateRunStage(runId, "codex_curation", { enrichmentSucceeded: succeeded, enrichmentFailed: failed });
  return { succeeded, failed };
}

export async function getCurationInput(runId: string) {
  const state = await getDashboardState();
  const items = await query<{
    id: string; title: string; publisher: string; source_url: string; published_at: Date | null;
    short_excerpt: string; evidence_text: string; limitations: string[];
  }>(
    `select raw.id, raw.title, raw.publisher, coalesce(raw.canonical_url, raw.source_url) source_url,
       raw.published_at, raw.short_excerpt, snapshot.evidence_text, snapshot.limitations
     from raw_items raw join source_snapshots snapshot on snapshot.raw_item_id = raw.id
     where raw.collection_run_id = $1 and raw.processing_status = 'awaiting_curation'
     order by raw.fetched_at`, [runId]
  );
  return {
    items: items.rows.map((row) => ({
      rawItemId: row.id, title: row.title, publisher: row.publisher, sourceUrl: row.source_url,
      publishedAt: row.published_at?.toISOString(), providerExcerpt: row.short_excerpt,
      evidenceText: row.evidence_text, limitations: row.limitations
    })),
    editorialPreferences: state.editorialPreferences,
    referenceLibrary: state.referenceLibrary,
    editorialPlaybooks: state.editorialPlaybooks
  };
}

export type CurationDecision = {
  rawItemIds: string[];
  disposition: "lead" | "rejected";
  title: string;
  leadBriefTh: string;
  whyItMattersTh: string;
  verifyNextTh: string;
  rejectionReason?: string;
  confidenceLabel: ConfidenceLabel;
  scores: {
    audienceFit: number; contentPotential: number; novelty: number;
    practicalValue: number; confidence: number; ranking: number;
  };
  topicTags: string[];
};

export async function applyCuration(runId: string, decisions: CurationDecision[]) {
  let leads = 0;
  let rejected = 0;
  await withTransaction(async (client) => {
    for (const decision of decisions) {
      const itemResult = await client.query<{ id: string; source_url: string }>(
        `select id, coalesce(canonical_url, source_url) source_url from raw_items
         where collection_run_id = $1 and id = any($2::text[]) and processing_status = 'awaiting_curation'`,
        [runId, decision.rawItemIds]
      );
      if (!itemResult.rows.length) continue;
      const clusterId = id("cluster");
      const canonical = itemResult.rows[0];
      await client.query(
        `insert into story_clusters (
           id, canonical_raw_item_id, title, cluster_summary, topic_tags, confidence_label, status
         ) values ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
        [
          clusterId, canonical.id, decision.title, decision.leadBriefTh,
          JSON.stringify(decision.topicTags), decision.confidenceLabel,
          decision.disposition === "lead" ? "lead" : "rejected"
        ]
      );
      for (const item of itemResult.rows) {
        await client.query(
          `insert into story_cluster_items (story_cluster_id, raw_item_id, contribution_note)
           values ($1,$2,$3)`,
          [clusterId, item.id, item.id === canonical.id ? "Canonical evidence" : "Supporting evidence"]
        );
      }
      if (decision.disposition === "lead") {
        leads += 1;
        await client.query(
          `insert into content_leads (
             id, story_cluster_id, title, source_url, lead_brief_th, confidence_label,
             audience_fit_score, content_potential_score, novelty_score, practical_value_score,
             confidence_score, ranking_score, why_it_matters_th, verify_next_th
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            id("lead"), clusterId, decision.title, canonical.source_url, decision.leadBriefTh,
            decision.confidenceLabel, decision.scores.audienceFit, decision.scores.contentPotential,
            decision.scores.novelty, decision.scores.practicalValue, decision.scores.confidence,
            decision.scores.ranking, decision.whyItMattersTh, decision.verifyNextTh
          ]
        );
      } else {
        rejected += 1;
        await client.query(
          `insert into rejected_items (id, story_cluster_id, title, source_url, rejection_reason)
           values ($1,$2,$3,$4,$5)`,
          [id("rejected"), clusterId, decision.title, canonical.source_url, decision.rejectionReason || "ไม่ผ่าน Codex Curation"]
        );
      }
      await client.query(
        `update raw_items set processing_status = 'processed', updated_at = now()
         where id = any($1::text[])`, [itemResult.rows.map((item) => item.id)]
      );
    }
  });
  await updateRunStage(runId, "editorial_generation", { curatedLeads: leads, curatedRejected: rejected });
  return { leads, rejected };
}

export async function finalizeRun(runId: string) {
  const counts = await query<{ status: string; count: string }>(
    `select processing_status status, count(*)::text count from raw_items
     where collection_run_id = $1 group by processing_status`, [runId]
  );
  const progress = Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)]));
  const partial = Boolean(progress.failed || progress.awaiting_enrichment || progress.awaiting_curation);
  const boardJob = await enqueueDailyBoardJob(undefined, runId);
  await query(
    `update collection_runs set stage = 'editorial_generation', partial = $2,
     progress = progress || $3::jsonb, updated_at = now() where id = $1`,
    [runId, partial, JSON.stringify(progress)]
  );
  return { boardJob, partial, progress };
}

export async function completeRunForBoard(runId: string) {
  await query(
    `update collection_runs set status = 'succeeded', stage = 'complete',
       completed_at = now(), updated_at = now()
     where id = $1 and status = 'running'`,
    [runId]
  );
}
