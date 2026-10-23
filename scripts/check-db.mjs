import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(`select
    (select count(*)::int from raw_items) raw_items,
    (select count(*)::int from story_clusters) story_clusters,
    (select count(*)::int from content_leads) content_leads,
    (select count(*)::int from rejected_items) rejected_items,
    (select count(*)::int from reference_library_items) references,
    (select count(*)::int from editorial_playbooks) playbooks,
    (select count(*)::int from daily_editorial_boards) boards,
    (select count(*)::int from daily_editorial_board_items) board_items,
    (select count(*)::int from jobs where status = 'pending') pending_jobs,
    (select count(*)::int from collection_runs where status = 'running') running_runs,
    (select max(last_seen_at) from worker_heartbeats) worker_last_seen`);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await client.end();
}
