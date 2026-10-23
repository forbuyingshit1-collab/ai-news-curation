create extension if not exists pgcrypto;

-- Kept temporarily so the data migration can be rerun safely. Runtime code no
-- longer treats this document as the system of record after normalization.
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id text primary key,
  type text not null check (type in ('manual_url', 'newsletter', 'api')),
  provider text unique,
  name text not null,
  trust_level text not null check (trust_level in ('high', 'medium', 'low')),
  enabled boolean not null default true,
  status text not null default 'ready' check (status in ('ready', 'needs_key', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collection_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  trigger text not null check (trigger in ('manual', 'scheduled')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table collection_runs add column if not exists stage text not null default 'api_collection';
alter table collection_runs add column if not exists progress jsonb not null default '{}'::jsonb;
alter table collection_runs add column if not exists partial boolean not null default false;
alter table collection_runs add column if not exists updated_at timestamptz not null default now();

create unique index if not exists collection_runs_scheduled_date_idx
  on collection_runs (run_date)
  where trigger = 'scheduled';

create table if not exists newsletter_editions (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text,
  sender text not null,
  subject text not null,
  sent_at timestamptz not null,
  content_excerpt text not null default '',
  status text not null default 'received' check (status in ('received', 'segmented', 'ignored', 'failed')),
  failure_reason text,
  collection_run_id uuid references collection_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists raw_items (
  id text primary key,
  source_id text not null references sources(id),
  newsletter_edition_id uuid references newsletter_editions(id) on delete set null,
  collection_run_id uuid references collection_runs(id) on delete set null,
  source_url text not null,
  canonical_url text,
  title text not null,
  author text,
  publisher text not null,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  short_excerpt text not null default '',
  extracted_claims jsonb not null default '[]'::jsonb,
  fingerprint text not null unique,
  language text not null default 'unknown',
  processing_status text not null default 'awaiting_enrichment'
    check (processing_status in ('awaiting_enrichment', 'enriched', 'awaiting_curation', 'processed', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raw_items_run_status_idx on raw_items (collection_run_id, processing_status);
create index if not exists raw_items_published_idx on raw_items (published_at desc);

create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  raw_item_id text not null unique references raw_items(id) on delete cascade,
  canonical_url text not null,
  extraction_method text not null check (extraction_method in ('http', 'playwright', 'newsletter', 'provider_excerpt')),
  evidence_text text not null,
  evidence_char_count int not null,
  content_hash text not null,
  claims jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  extracted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists source_snapshots_hash_idx on source_snapshots (content_hash);
create index if not exists source_snapshots_expiry_idx on source_snapshots (expires_at);

create table if not exists story_clusters (
  id text primary key,
  canonical_raw_item_id text references raw_items(id) on delete set null,
  title text not null,
  cluster_summary text not null default '',
  topic_tags jsonb not null default '[]'::jsonb,
  confidence_label text not null check (confidence_label in ('high', 'medium', 'low')),
  status text not null check (status in ('candidate', 'lead', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists story_cluster_items (
  story_cluster_id text not null references story_clusters(id) on delete cascade,
  raw_item_id text not null references raw_items(id) on delete cascade,
  contribution_note text not null default '',
  primary key (story_cluster_id, raw_item_id)
);

create table if not exists content_leads (
  id text primary key,
  story_cluster_id text not null unique references story_clusters(id) on delete cascade,
  title text not null,
  source_url text not null,
  lead_brief_th text not null,
  confidence_label text not null check (confidence_label in ('high', 'medium', 'low')),
  audience_fit_score int not null check (audience_fit_score between 0 and 100),
  content_potential_score int not null check (content_potential_score between 0 and 100),
  novelty_score int not null check (novelty_score between 0 and 100),
  practical_value_score int not null check (practical_value_score between 0 and 100),
  confidence_score int not null check (confidence_score between 0 and 100),
  ranking_score int not null check (ranking_score between 0 and 100),
  why_it_matters_th text not null,
  verify_next_th text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rejected_items (
  id text primary key,
  story_cluster_id text not null unique references story_clusters(id) on delete cascade,
  title text not null,
  source_url text not null,
  rejection_reason text not null,
  rejected_at timestamptz not null default now()
);

create table if not exists lead_feedback (
  id uuid primary key default gen_random_uuid(),
  content_lead_id text not null references content_leads(id) on delete cascade,
  feedback text not null check (feedback in ('interested', 'not_relevant', 'too_weak', 'already_known')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_feedback_lead_idx on lead_feedback (content_lead_id, created_at desc);

create table if not exists content_expansions (
  id text primary key,
  content_lead_id text not null unique references content_leads(id) on delete cascade,
  summary_th text not null,
  key_facts jsonb not null default '[]'::jsonb,
  source_context text not null,
  suggested_angles_th jsonb not null default '[]'::jsonb,
  possible_hooks_th jsonb not null default '[]'::jsonb,
  cautions_th text not null,
  recommended_format text not null,
  created_at timestamptz not null default now()
);

create table if not exists editorial_preferences (
  id text primary key,
  preference_type text not null,
  description text not null,
  evidence_count int not null default 1,
  last_seen_at timestamptz not null default now()
);

create table if not exists reference_library_items (
  id text primary key,
  source_name text not null,
  source_url text not null,
  kind text not null check (kind in ('page_profile', 'public_post_sample')),
  title text not null,
  summary_th text not null,
  observed_signals jsonb not null default '[]'::jsonb,
  usage_guidance_th jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now(),
  unique (source_name, source_url, kind)
);

create table if not exists editorial_playbooks (
  id uuid primary key default gen_random_uuid(),
  source_name text not null unique,
  sample_count int not null default 0,
  selection_signals jsonb not null default '[]'::jsonb,
  useful_angles jsonb not null default '[]'::jsonb,
  audience_assumptions jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed')),
  board_date date,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jobs add column if not exists collection_run_id uuid references collection_runs(id) on delete cascade;
alter table jobs add column if not exists raw_item_id text references raw_items(id) on delete cascade;
alter table jobs add column if not exists available_at timestamptz not null default now();
alter table jobs add column if not exists max_attempts int not null default 3;

create index if not exists jobs_claim_idx on jobs (status, available_at, created_at);
create unique index if not exists jobs_active_run_idx
  on jobs (type, collection_run_id)
  where collection_run_id is not null and status in ('pending', 'running');

create table if not exists worker_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists worker_heartbeats (
  worker_id text primary key,
  capabilities jsonb not null default '[]'::jsonb,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table if not exists rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  request_count int not null default 0
);

create table if not exists daily_editorial_boards (
  id uuid primary key default gen_random_uuid(),
  board_date date not null unique,
  timezone text not null default 'Asia/Bangkok',
  status text not null check (status in ('pending', 'partial', 'ready')),
  expected_count int not null default 0,
  generated_count int not null default 0,
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists daily_editorial_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references daily_editorial_boards(id) on delete cascade,
  content_lead_id text not null,
  position int not null check (position between 1 and 10),
  title text not null,
  summary_th text not null,
  source_name text not null,
  source_url text not null,
  published_at timestamptz,
  confidence_label text not null check (confidence_label in ('high', 'medium', 'low')),
  created_at timestamptz not null default now(),
  unique (board_id, position),
  unique (board_id, content_lead_id)
);

insert into sources (id, type, provider, name, trust_level, enabled, status) values
  ('src_manual', 'manual_url', null, 'Manual URL Intake', 'medium', true, 'ready'),
  ('src_newsletter_gmail', 'newsletter', null, 'Dedicated Gmail Newsletter Intake', 'high', true, 'ready'),
  ('src_api_hacker_news', 'api', 'hacker_news', 'Hacker News API', 'medium', true, 'ready'),
  ('src_api_dev_to', 'api', 'dev_to', 'DEV Community API', 'medium', true, 'ready'),
  ('src_api_newsdata', 'api', 'newsdata', 'NewsData.io', 'medium', true, 'needs_key'),
  ('src_api_the_news_api', 'api', 'the_news_api', 'The News API', 'medium', true, 'needs_key'),
  ('src_api_gdelt', 'api', 'gdelt', 'GDELT API', 'medium', true, 'ready'),
  ('src_api_newsapi', 'api', 'newsapi', 'NewsAPI.org', 'medium', true, 'needs_key'),
  ('src_api_gnews', 'api', 'gnews', 'GNews API', 'medium', true, 'needs_key'),
  ('src_api_mediastack', 'api', 'mediastack', 'Mediastack API', 'medium', true, 'needs_key')
on conflict (id) do update set
  name = excluded.name,
  enabled = excluded.enabled,
  updated_at = now();
