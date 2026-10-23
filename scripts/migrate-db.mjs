import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function migrateLegacyState() {
  const result = await client.query("select data from app_state where id = 'main'");
  const state = result.rows[0]?.data;
  if (!state) return;

  await client.query("begin");
  try {
    for (const source of state.sources ?? []) {
      await client.query(
        `insert into sources (id, type, provider, name, trust_level, enabled, status)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set name = excluded.name, enabled = excluded.enabled, updated_at = now()`,
        [source.id, source.type, source.provider ?? null, source.name, source.trustLevel, source.enabled, source.status ?? "ready"]
      );
    }

    for (const raw of state.rawItems ?? []) {
      await client.query(
        `insert into raw_items (
           id, source_id, source_url, canonical_url, title, publisher, published_at,
           fetched_at, short_excerpt, extracted_claims, fingerprint, language, processing_status
         ) values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,'processed')
         on conflict (id) do nothing`,
        [
          raw.id, raw.sourceId, raw.sourceUrl, raw.title, raw.publisher,
          raw.publishedAt ?? null, raw.fetchedAt, raw.shortExcerpt,
          JSON.stringify(raw.extractedClaims ?? []), raw.fingerprint, raw.language
        ]
      );
    }

    const knownClusters = new Set((state.storyClusters ?? []).map((cluster) => cluster.id));
    for (const lead of state.leads ?? []) {
      if (!knownClusters.has(lead.storyClusterId)) {
        state.storyClusters ??= [];
        state.storyClusters.push({
          id: lead.storyClusterId,
          canonicalRawItemId: null,
          title: lead.title,
          clusterSummary: lead.leadBriefTh,
          topicTags: ["legacy"],
          confidenceLabel: lead.confidenceLabel,
          status: "lead"
        });
        knownClusters.add(lead.storyClusterId);
      }
    }
    for (const rejected of state.rejected ?? []) {
      if (!knownClusters.has(rejected.storyClusterId)) {
        state.storyClusters ??= [];
        state.storyClusters.push({
          id: rejected.storyClusterId,
          canonicalRawItemId: null,
          title: rejected.title,
          clusterSummary: rejected.rejectionReason,
          topicTags: ["legacy"],
          confidenceLabel: "medium",
          status: "rejected"
        });
        knownClusters.add(rejected.storyClusterId);
      }
    }

    const rawIds = new Set((state.rawItems ?? []).map((raw) => raw.id));
    for (const cluster of state.storyClusters ?? []) {
      const canonicalId = rawIds.has(cluster.canonicalRawItemId) ? cluster.canonicalRawItemId : null;
      await client.query(
        `insert into story_clusters (
           id, canonical_raw_item_id, title, cluster_summary, topic_tags, confidence_label, status
         ) values ($1,$2,$3,$4,$5::jsonb,$6,$7)
         on conflict (id) do nothing`,
        [cluster.id, canonicalId, cluster.title, cluster.clusterSummary, JSON.stringify(cluster.topicTags ?? []), cluster.confidenceLabel, cluster.status]
      );
      if (canonicalId) {
        await client.query(
          `insert into story_cluster_items (story_cluster_id, raw_item_id, contribution_note)
           values ($1,$2,'Migrated canonical source') on conflict do nothing`,
          [cluster.id, canonicalId]
        );
      }
    }

    for (const lead of state.leads ?? []) {
      const scores = lead.scores;
      await client.query(
        `insert into content_leads (
           id, story_cluster_id, title, source_url, lead_brief_th, confidence_label,
           audience_fit_score, content_potential_score, novelty_score, practical_value_score,
           confidence_score, ranking_score, why_it_matters_th, verify_next_th, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         on conflict (id) do nothing`,
        [
          lead.id, lead.storyClusterId, lead.title, lead.sourceUrl, lead.leadBriefTh,
          lead.confidenceLabel, scores.audienceFit, scores.contentPotential, scores.novelty,
          scores.practicalValue, scores.confidence, scores.ranking, lead.whyItMattersTh,
          lead.verifyNextTh, lead.createdAt
        ]
      );
      if (lead.feedback) {
        await client.query(
          `insert into lead_feedback (content_lead_id, feedback)
           select $1,$2 where not exists (
             select 1 from lead_feedback where content_lead_id = $1 and feedback = $2
           )`,
          [lead.id, lead.feedback]
        );
      }
      if (lead.expansion) {
        const expansion = lead.expansion;
        await client.query(
          `insert into content_expansions (
             id, content_lead_id, summary_th, key_facts, source_context, suggested_angles_th,
             possible_hooks_th, cautions_th, recommended_format, created_at
           ) values ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
           on conflict (id) do nothing`,
          [
            expansion.id, lead.id, expansion.summaryTh, JSON.stringify(expansion.keyFacts),
            expansion.sourceContext, JSON.stringify(expansion.suggestedAnglesTh),
            JSON.stringify(expansion.possibleHooksTh), expansion.cautionsTh,
            expansion.recommendedFormat, expansion.createdAt
          ]
        );
      }
    }

    for (const rejected of state.rejected ?? []) {
      await client.query(
        `insert into rejected_items (id, story_cluster_id, title, source_url, rejection_reason, rejected_at)
         values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
        [rejected.id, rejected.storyClusterId, rejected.title, rejected.sourceUrl, rejected.rejectionReason, rejected.rejectedAt]
      );
    }

    for (const preference of state.editorialPreferences ?? []) {
      await client.query(
        `insert into editorial_preferences (id, preference_type, description, evidence_count, last_seen_at)
         values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
        [preference.id, preference.preferenceType, preference.description, preference.evidenceCount, preference.lastSeenAt]
      );
    }

    for (const item of state.referenceLibrary ?? []) {
      await client.query(
        `insert into reference_library_items (
           id, source_name, source_url, kind, title, summary_th, observed_signals, usage_guidance_th, captured_at
         ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
         on conflict (id) do nothing`,
        [
          item.id, item.sourceName, item.sourceUrl, item.kind, item.title, item.summaryTh,
          JSON.stringify(item.observedSignals), JSON.stringify(item.usageGuidanceTh), item.capturedAt
        ]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

try {
  await client.connect();
  await client.query(sql);
  await migrateLegacyState();
  console.log("Database schema is up to date.");
} finally {
  await client.end();
}
