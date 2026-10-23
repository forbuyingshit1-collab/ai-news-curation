# AI News Curation Technical Blueprint

## Product Shape

The MVP is a curation dashboard backed by a database and backend capability workers. It collects raw items from manual URLs, newsletters, and approved API providers, groups related items into story clusters, scores them, presents Thai lead briefs, captures feedback, and expands only the leads the reader marks as interested.

n8n is not part of the MVP architecture.

## Recommended Stack

- **App**: Next.js with App Router
- **Database**: Postgres
- **ORM**: Prisma or Drizzle
- **Jobs**: database-backed job table first; queue service can be added later
- **AI service layer**: Local Codex CLI worker with schema-constrained output
- **Auth**: single-user password session for the dashboard and a separate bearer token for local capability workers

## Core Data Model

**Source**

- id
- type: manual_url, newsletter
- name
- trust_level
- enabled

**RawItem**

- id
- source_id
- source_url
- title
- author
- publisher
- published_at
- fetched_at
- short_excerpt
- extracted_claims
- fingerprint
- language
- processing_status

**StoryCluster**

- id
- canonical_raw_item_id
- title
- cluster_summary
- topic_tags
- confidence_label
- status: candidate, lead, rejected

**StoryClusterItem**

- story_cluster_id
- raw_item_id
- contribution_note

**ContentLead**

- id
- story_cluster_id
- lead_brief_th
- audience_fit_score
- content_potential_score
- novelty_score
- practical_value_score
- confidence_score
- ranking_score
- why_it_matters_th
- verify_next_th
- created_at

**RejectedItem**

- id
- story_cluster_id
- rejection_reason
- rejected_at

**LeadFeedback**

- id
- content_lead_id
- feedback: interested, not_relevant, too_weak, already_known
- note
- created_at

**ContentExpansion**

- id
- content_lead_id
- summary_th
- key_facts
- source_context
- suggested_angles_th
- possible_hooks_th
- cautions_th
- recommended_format
- created_at

**EditorialPreference**

- id
- preference_type
- description
- evidence_count
- last_seen_at

**Job**

- id
- type
- status: pending, running, succeeded, failed
- payload
- attempts
- last_error
- created_at
- updated_at

## Capability Workers

**Manual URL Intake Worker**

Validates a submitted public URL, creates an Awaiting Enrichment Raw Item, and queues the same Source Enrichment and Codex Curation path used by other sources. Submission returns immediately without fabricating a Content Lead from URL metadata; failed extraction remains visible with a reason and a retry action.

**Newsletter Intake Worker**

Reads the Dedicated Intake Mailbox through local read-only Gmail OAuth, excludes account-security and non-editorial administrative messages, and preserves each Newsletter Edition. A deterministic parser normalizes HTML into headings, text, and observed links while removing navigation, tracking, social, and unsubscribe elements; schema-constrained Codex segmentation then creates one or more Newsletter Stories using only links present in the message. Failed segmentation is retried rather than inventing a story or URL. The first sync covers the previous seven days; later runs use Gmail checkpoints to collect only new messages without changing mailbox state.

**API Intake Worker**

Calls the enabled provider adapters for Hacker News, DEV Community, NewsData.io, The News API, GDELT, NewsAPI.org, GNews, and Mediastack. It normalizes titles, URLs, publishers, dates, and short excerpts before deduplication. Missing credentials skip only the affected provider.

**Source Enrichment Worker**

Runs locally and extracts main text with HTTP fetch plus `trafilatura` first, using Playwright only when a successfully loaded page has insufficient main text because it depends on JavaScript. Both paths enforce public-network URL validation, redirect and size limits, timeouts, and no login or paywall bypass, while recording the extraction method and limitations with the Source Snapshot.

**Story Clustering Worker**

Matches new raw items against existing story clusters using fingerprint, URL canonicalization, title similarity, source metadata, and embeddings when needed.

**Lead Scoring Worker**

Runs local Codex Curation in schema-constrained batches after Source Enrichment. It evaluates current evidence and story clusters against editorial scope, target audience, Editorial Memory, and the Reference Library, then produces explainable Lead Scores, confidence labels, Thai lead briefs, verification notes, or rejected items; URL and keyword heuristics are not authoritative scoring.

**Expansion Worker**

Runs only after interested feedback. Produces content expansion with source links, key facts, angles, hooks, cautions, and recommended Facebook content format.

**Editorial Memory Worker**

Periodically derives editorial preferences from lead feedback and updates preference records.

**Reference Library Worker**

Stores up to fifteen attributed Public Post Snapshots from each approved reference page and derives one Editorial Playbook per page. It records only material that can actually be observed, never fabricates inaccessible posts, and uses the playbooks for selection guidance rather than current-event evidence or wording imitation.

**Daily Editorial Board Worker**

Runs through Codex CLI on the operator's Windows PC, claims a persistent job, selects up to ten strong leads using Editorial Memory and Reference Library signals, writes substantive Thai summaries grounded in current source material, and stores the board in Postgres. The worker polls every minute and triggers the daily collection at 08:00 Asia/Bangkok when the machine is available.

## Main Workflow

1. Reader submits a manual URL.
2. Manual URL intake creates a raw item and source snapshot.
3. Story clustering attaches the raw item to an existing story cluster or creates a new one.
4. Lead scoring evaluates the story cluster.
5. If useful, the system creates a content lead with a Thai lead brief.
6. If weak, duplicate, off-scope, or low-confidence, the system puts it in the rejected queue with a reason.
7. Reader reviews lead briefs in the curation dashboard.
8. Reader gives lead feedback.
9. Interested feedback triggers content expansion.
10. Feedback updates editorial memory over time.
11. A manual or scheduled Collection Run fetches enabled hosted API sources and queues a local Gmail sync.
12. Newsletter Stories and API Raw Items enter Source Enrichment, deduplication, and scoring through the same pipeline.
13. The dashboard reports collection, Gmail, enrichment, editorial-generation, and complete or partial stages without holding one long browser request open.
14. The Local Codex Worker generates and saves the date's Thai board after enrichment completes or its window closes.

## Dashboard Screens

**Leads**

- ranked lead brief list
- confidence label
- score breakdown
- source links
- feedback buttons
- action to generate content expansion

**Lead Detail**

- lead brief
- story cluster sources
- extracted claims
- score explanation
- verification notes
- content expansion when generated

**Rejected Queue**

- rejected clusters
- rejection reason
- source links
- action to restore or mark as useful

**Sources**

- manual URL submission
- newsletter source status
- enabled/disabled sources

**Editorial Memory**

- learned preferences
- favorite sources/topics/angles
- rejection patterns
- controls to edit or disable a preference

**Daily Editorial Board**

- up to ten ranked stories
- one- or two-paragraph Thai summaries
- source, publication date, confidence label, and source link
- pending, partial, and ready states
- thirty-day date selector

**Processing Runs**

- current and recent Collection Runs with stage and elapsed time
- progress counts for API collection, Gmail editions and stories, Source Enrichment, Codex Curation, and editorial generation
- succeeded, duplicate, rejected, timed-out, failed, and awaiting counts
- source-level failures with bounded retry actions
- latest local Worker heartbeat without technical logs or secrets
- navigation from a completed run to its Daily Editorial Board

## API Surface

- `POST /api/intake/manual-url`
- `GET /api/leads`
- `GET /api/leads/:id`
- `POST /api/leads/:id/feedback`
- `POST /api/leads/:id/expand`
- `GET /api/rejected`
- `POST /api/rejected/:id/restore`
- `GET /api/sources`
- `GET /api/intake/apis`
- `POST /api/intake/apis`
- `POST /api/sources`
- `GET /api/editorial-memory`
- `PATCH /api/editorial-memory/:id`

## AI Output Contracts

Lead brief output must include:

- Thai title
- one-paragraph Thai brief
- why it matters to the target audience
- confidence label
- score breakdown
- source URLs
- what to verify next when confidence is medium or low

Content expansion output must include:

- fuller Thai summary
- key facts
- source context
- suggested content angles
- possible hooks
- cautions
- recommended Facebook format
- no final post unless explicitly requested

## MVP Milestones

**Milestone 1: Foundation**

- Next.js app
- Postgres schema
- job table
- basic dashboard layout

**Milestone 2: Manual URL Loop**

- manual URL intake
- source snapshot extraction
- raw item creation
- basic story clustering

**Milestone 3: Lead Quality Loop**

- lead scoring
- Thai lead briefs
- rejected queue
- feedback buttons
- content expansion on interested

**Milestone 4: Editorial Memory**

- derive preferences from feedback
- show preferences in dashboard
- apply preferences to future scoring

**Milestone 5: Newsletter Intake**

- connect email/newsletter ingestion
- convert newsletter messages into raw items
- monitor processing failures

## Deferred Features

- tracked source account ingestion from X
- video evidence packs
- final Facebook post generation
- automated digests
- fine-tuning
- external workflow orchestration
- multi-user collaboration

## Risks

- Source extraction can fail on paywalled or dynamic pages.
- AI scoring may look plausible while missing the reader's actual taste until enough feedback exists.
- Newsletter ingestion needs careful handling to avoid pulling unrelated email.
- Thai summaries can accidentally overstate English source material; editorial guardrails must be enforced in prompts and review UI.
- Scheduled board generation depends on the operator's PC being powered on, online, and authenticated to Codex CLI.
- Story clustering can merge related but meaningfully different product updates if similarity rules are too loose.

## First Build Target

Build the manual URL path end to end before adding newsletter intake. The first useful demo should let the reader submit a URL, see a Thai lead brief or rejection reason, give feedback, and generate a content expansion for interested leads.
