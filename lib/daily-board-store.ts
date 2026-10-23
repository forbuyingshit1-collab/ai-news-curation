import "server-only";

import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { getDashboardState } from "@/lib/persistent-store";
import type {
  ConfidenceLabel,
  DailyEditorialBoard,
  DailyEditorialBoardItem
} from "@/lib/types";

export type DailyBoardCandidate = {
  contentLeadId: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt?: string;
  sourceExcerpt: string;
  leadBriefTh: string;
  whyItMattersTh: string;
  confidenceLabel: ConfidenceLabel;
  rankingScore: number;
  isHowTo: boolean;
};

export type DailyBoardJobPayload = {
  boardDate: string;
  timezone: "Asia/Bangkok";
  expectedCount: number;
  candidates: DailyBoardCandidate[];
  editorialPreferences: Array<{ preferenceType: string; description: string }>;
  referenceLibrary: Array<{
    sourceName: string;
    title: string;
    summaryTh: string;
    observedSignals: string[];
    usageGuidanceTh: string[];
  }>;
};

export type ClaimedDailyBoardJob = {
  id: string;
  attempts: number;
  payload: DailyBoardJobPayload;
};

export type GeneratedBoardItem = {
  contentLeadId: string;
  summaryTh: string;
  confidenceLabel: ConfidenceLabel;
};

type BoardRow = {
  board_id: string;
  board_date: string | Date;
  timezone: "Asia/Bangkok";
  status: DailyEditorialBoard["status"];
  expected_count: number;
  generated_count: number;
  generated_at: Date | null;
  updated_at: Date;
  item_id: string | null;
  content_lead_id: string | null;
  position: number | null;
  title: string | null;
  summary_th: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: Date | null;
  confidence_label: ConfidenceLabel | null;
};

function isoDate(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isoTimestamp(value: Date | null) {
  return value?.toISOString();
}

export function bangkokDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function getDailyBoards(limit = 30) {
  const result = await query<BoardRow>(
    `select
       board.id as board_id,
       board.board_date,
       board.timezone,
       board.status,
       board.expected_count,
       board.generated_count,
       board.generated_at,
       board.updated_at,
       item.id as item_id,
       item.content_lead_id,
       item.position,
       item.title,
       item.summary_th,
       item.source_name,
       item.source_url,
       item.published_at,
       item.confidence_label
     from daily_editorial_boards board
     left join daily_editorial_board_items item on item.board_id = board.id
     where board.board_date >= (current_date - interval '30 days')
     order by board.board_date desc, item.position asc
     limit $1`,
    [Math.max(1, limit) * 10]
  );

  const boards = new Map<string, DailyEditorialBoard>();
  for (const row of result.rows) {
    const boardId = row.board_id;
    if (!boards.has(boardId)) {
      boards.set(boardId, {
        id: boardId,
        boardDate: isoDate(row.board_date),
        timezone: row.timezone,
        status: row.status,
        expectedCount: row.expected_count,
        generatedCount: row.generated_count,
        generatedAt: isoTimestamp(row.generated_at),
        updatedAt: row.updated_at.toISOString(),
        items: []
      });
    }

    if (row.item_id && row.content_lead_id && row.position && row.title && row.summary_th && row.source_name && row.source_url && row.confidence_label) {
      const item: DailyEditorialBoardItem = {
        id: row.item_id,
        contentLeadId: row.content_lead_id,
        position: row.position,
        title: row.title,
        summaryTh: row.summary_th,
        sourceName: row.source_name,
        sourceUrl: row.source_url,
        publishedAt: isoTimestamp(row.published_at),
        confidenceLabel: row.confidence_label
      };
      boards.get(boardId)?.items.push(item);
    }
  }

  return [...boards.values()].slice(0, limit);
}

function isHowToText(value: string) {
  return /how[ -]?to|tutorial|guide|cookbook|walkthrough|step[ -]?by[ -]?step|วิธี|สอน|คู่มือ/i.test(value);
}

export async function enqueueDailyBoardJob(boardDate = bangkokDate(), collectionRunId?: string) {
  const state = await getDashboardState();
  const result = await query<{
    id: string; title: string; source_url: string; lead_brief_th: string;
    why_it_matters_th: string; confidence_label: ConfidenceLabel; ranking_score: number;
    publisher: string | null; published_at: Date | null; fetched_at: Date | null;
    evidence_text: string | null;
  }>(
    `select lead.id, lead.title, lead.source_url, lead.lead_brief_th,
       lead.why_it_matters_th, lead.confidence_label, lead.ranking_score,
       raw.publisher, raw.published_at, raw.fetched_at, snapshot.evidence_text
     from content_leads lead
     join story_clusters cluster on cluster.id = lead.story_cluster_id
     left join raw_items raw on raw.id = cluster.canonical_raw_item_id
     left join source_snapshots snapshot on snapshot.raw_item_id = raw.id
     where not exists (
       select 1 from daily_editorial_board_items item
       join daily_editorial_boards board on board.id = item.board_id
       where item.content_lead_id = lead.id
         and board.board_date < $1::date
         and board.board_date >= ($1::date - interval '30 days')
     )
     order by lead.ranking_score desc, lead.created_at desc
     limit 100`,
    [boardDate]
  );
  const now = Date.now();
  const freshnessLimit = 72 * 60 * 60 * 1000;

  const candidates = result.rows
    .map((lead) => {
      const text = `${lead.title} ${lead.evidence_text ?? ""} ${lead.source_url}`;
      const isHowTo = isHowToText(text);
      const discoveredAt = lead.fetched_at?.getTime() ?? now;
      const publishedAt = lead.published_at?.getTime() ?? discoveredAt;
      const eligible = now - discoveredAt <= freshnessLimit && (isHowTo || now - publishedAt <= freshnessLimit);

      return {
        eligible,
        candidate: {
          contentLeadId: lead.id,
          title: lead.title,
          sourceName: lead.publisher ?? new URL(lead.source_url).hostname.replace(/^www\./, ""),
          sourceUrl: lead.source_url,
          publishedAt: isoTimestamp(lead.published_at),
          sourceExcerpt: lead.evidence_text ?? lead.lead_brief_th,
          leadBriefTh: lead.lead_brief_th,
          whyItMattersTh: lead.why_it_matters_th,
          confidenceLabel: lead.confidence_label,
          rankingScore: lead.ranking_score,
          isHowTo
        } satisfies DailyBoardCandidate
      };
    })
    .filter((item) => item.eligible)
    .map((item) => item.candidate)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 30);

  const payload: DailyBoardJobPayload = {
    boardDate,
    timezone: "Asia/Bangkok",
    expectedCount: Math.min(10, candidates.length),
    candidates,
    editorialPreferences: state.editorialPreferences.map(({ preferenceType, description }) => ({
      preferenceType,
      description
    })),
    referenceLibrary: state.referenceLibrary.map(({ sourceName, title, summaryTh, observedSignals, usageGuidanceTh }) => ({
      sourceName,
      title,
      summaryTh,
      observedSignals,
      usageGuidanceTh
    }))
  };

  return withTransaction(async (client) => {
    await client.query(`delete from daily_editorial_boards where board_date < (current_date - interval '30 days')`);
    const boardResult = await client.query<{ id: string }>(
      `insert into daily_editorial_boards (board_date, status, expected_count, generated_count)
       values ($1, $2, $3, 0)
       on conflict (board_date) do update set
         status = excluded.status,
         expected_count = excluded.expected_count,
         updated_at = now()
       returning id`,
      [boardDate, candidates.length === 0 ? "ready" : "pending", payload.expectedCount]
    );

    if (candidates.length === 0) {
      return { boardId: boardResult.rows[0].id, status: "ready" as const, expectedCount: 0 };
    }

    const pending = await client.query<{ id: string }>(
      `select id from jobs
       where type = 'generate_daily_board' and board_date = $1 and status = 'pending'
       order by created_at desc limit 1 for update`,
      [boardDate]
    );

    let jobId: string;
    if (pending.rows[0]) {
      jobId = pending.rows[0].id;
      await client.query(
        `update jobs set payload = $2::jsonb, collection_run_id = $3, updated_at = now(), last_error = null where id = $1`,
        [jobId, JSON.stringify(payload), collectionRunId ?? null]
      );
    } else {
      const job = await client.query<{ id: string }>(
        `insert into jobs (type, status, board_date, collection_run_id, payload)
         values ('generate_daily_board', 'pending', $1, $2, $3::jsonb)
         returning id`,
        [boardDate, collectionRunId ?? null, JSON.stringify(payload)]
      );
      jobId = job.rows[0].id;
    }

    return {
      boardId: boardResult.rows[0].id,
      jobId,
      status: "pending" as const,
      expectedCount: payload.expectedCount
    };
  });
}

export async function claimDailyBoardJob() {
  return withTransaction(async (client) => {
    await client.query(
      `update jobs set status = 'pending', updated_at = now(), last_error = 'worker lease expired'
       where type = 'generate_daily_board'
         and status = 'running'
         and updated_at < now() - interval '15 minutes'
         and attempts < 3`
    );

    const result = await client.query<{ id: string; attempts: number; payload: DailyBoardJobPayload }>(
      `select id, attempts, payload
       from jobs
       where type = 'generate_daily_board' and status = 'pending' and attempts < 3
       order by created_at asc
       limit 1
       for update skip locked`
    );
    const job = result.rows[0];
    if (!job) return null;

    await client.query(
      `update jobs set status = 'running', attempts = attempts + 1, updated_at = now() where id = $1`,
      [job.id]
    );
    return { ...job, attempts: job.attempts + 1 } satisfies ClaimedDailyBoardJob;
  });
}

export async function completeDailyBoardJob(jobId: string, items: GeneratedBoardItem[]) {
  return withTransaction(async (client) => {
    const jobResult = await client.query<{
      board_date: string | Date; payload: DailyBoardJobPayload; collection_run_id: string | null;
    }>(
      `select board_date, payload, collection_run_id from jobs where id = $1 and type = 'generate_daily_board' for update`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return null;

    const boardDate = isoDate(job.board_date);
    const boardResult = await client.query<{ id: string; expected_count: number }>(
      `select id, expected_count from daily_editorial_boards where board_date = $1 for update`,
      [boardDate]
    );
    const board = boardResult.rows[0];
    if (!board) return null;

    const candidates = new Map(job.payload.candidates.map((candidate) => [candidate.contentLeadId, candidate]));
    const accepted = items
      .filter((item) => candidates.has(item.contentLeadId))
      .slice(0, 10);

    await client.query(`delete from daily_editorial_board_items where board_id = $1`, [board.id]);
    for (const [index, item] of accepted.entries()) {
      const candidate = candidates.get(item.contentLeadId)!;
      await client.query(
        `insert into daily_editorial_board_items (
           board_id, content_lead_id, position, title, summary_th, source_name,
           source_url, published_at, confidence_label
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          board.id,
          candidate.contentLeadId,
          index + 1,
          candidate.title,
          item.summaryTh,
          candidate.sourceName,
          candidate.sourceUrl,
          candidate.publishedAt ?? null,
          item.confidenceLabel
        ]
      );
    }

    // A complete worker response may intentionally contain fewer than the
    // candidate cap. Weak stories must not be used to pad the board.
    const status = "ready" as const;
    await client.query(
      `update daily_editorial_boards set
         status = $2,
         generated_count = $3,
         generated_at = now(),
         updated_at = now()
       where id = $1`,
      [board.id, status, accepted.length]
    );
    await client.query(
      `update jobs set status = 'succeeded', last_error = null, updated_at = now() where id = $1`,
      [jobId]
    );

    return { boardId: board.id, boardDate, status, generatedCount: accepted.length, collectionRunId: job.collection_run_id };
  });
}

export async function failDailyBoardJob(jobId: string, error: string) {
  return withTransaction(async (client) => {
    const result = await client.query<{ attempts: number; board_date: string | Date }>(
      `select attempts, board_date from jobs where id = $1 for update`,
      [jobId]
    );
    const job = result.rows[0];
    if (!job) return null;

    const nextStatus = job.attempts < 3 ? "pending" : "failed";
    await client.query(
      `update jobs set status = $2, last_error = $3, updated_at = now() where id = $1`,
      [jobId, nextStatus, error.slice(0, 1000)]
    );
    await client.query(
      `update daily_editorial_boards board set
         status = case when board.generated_count > 0 then 'partial' else 'pending' end,
         updated_at = now()
       where board.board_date = $1`,
      [isoDate(job.board_date)]
    );
    return { status: nextStatus };
  });
}

export async function beginScheduledCollection(boardDate = bangkokDate()) {
  const result = await query<{ id: string }>(
    `insert into collection_runs (run_date, trigger, status)
     values ($1, 'scheduled', 'running')
     on conflict (run_date) where trigger = 'scheduled' do nothing
     returning id`,
    [boardDate]
  );
  return result.rows[0]?.id ?? null;
}

export async function finishCollectionRun(id: string, status: "succeeded" | "failed", summary: unknown) {
  await query(
    `update collection_runs set status = $2, summary = $3::jsonb, completed_at = now() where id = $1`,
    [id, status, JSON.stringify(summary)]
  );
}
