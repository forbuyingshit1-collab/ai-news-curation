# AI News Curation MVP Plan

## Goal

Prove that the system can filter news updates and how-to content into content leads the reader wants to inspect and potentially turn into Facebook Page content.

## MVP Scope

- Manual URL intake
- Newsletter intake
- Source snapshots with metadata, source links, excerpts, extracted claims, and fingerprints
- Story clusters before content leads
- Thai lead briefs
- Explainable lead scores
- Confidence labels
- Rejected queue with rejection reasons
- Lead feedback
- Content expansions only after the reader marks a lead as interested
- Editorial memory updates from feedback
- Curation dashboard as the primary interface
- Daily Editorial Board with up to ten substantive Thai summaries
- Local Codex CLI generation through a persistent job queue
- Thirty-day board history

## Deferred

- Tracked source account ingestion from X
- Video evidence packs
- Document and video upload intake
- Final Facebook post generation
- Fine-tuning
- n8n or other external workflow orchestration

## Current Milestone

- Read-only Gmail Newsletter Intake from the Dedicated Intake Mailbox
- Split Newsletter Editions into independently curated Newsletter Stories
- Source Enrichment for every eligible primary-content URL
- Batch Codex Curation from current evidence instead of heuristic Lead Scores
- Story deduplication across APIs, newsletters, and Manual URL Intake
- Normalized Postgres domain tables and migration away from `app_state`
- Single-user dashboard authentication, separate Worker authentication, rate limits, and URL safety controls
- Pipeline-stage visibility and partial-result handling in the Curation Dashboard
- Reference Library records that are suitable for selection guidance without copying source wording

## First Success Metric

The MVP succeeds when it produces at least five usable Facebook Page content ideas per week from the reviewed content leads.

## Current Milestone Definition of Done

- Single-user dashboard sessions protect UI and mutation APIs; a separate token protects Worker and automation APIs.
- Read-only Gmail OAuth connects the Dedicated Intake Mailbox, backfills seven days, and resumes incrementally without duplicate messages.
- Newsletter Editions split into independently curated Newsletter Stories using only observed message links.
- API, Gmail, and Manual URL sources enter one asynchronous enrichment, clustering, curation, and board pipeline.
- Every eligible URL either produces a bounded Source Snapshot or records a visible failure reason and retry state.
- Cross-source duplicates preserve supporting sources in one Story Cluster and prefer primary evidence.
- Batch Codex Curation is authoritative for Lead Scores and rejection; failed batches remain Awaiting Curation.
- Daily Editorial Boards contain at most ten grounded Thai summaries and expose ready or partial evidence coverage.
- Processing Runs show stages, counts, failures, retry actions, and the latest Worker heartbeat.
- The Reference Library contains up to fifteen observed Public Post Snapshots per approved page and one Editorial Playbook per page, without fabricated inaccessible material.
- Migration from `app_state` preserves existing curation data and Daily Editorial Board history.
- Automated tests, type checking, production build, responsive browser QA, and Worker restart catch-up verification pass.
