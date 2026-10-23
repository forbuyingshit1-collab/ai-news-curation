# AI News Curation MVP

Dashboard MVP for filtering AI news updates and how-to content into Thai content leads for Facebook Page ideation.

## Current State

- Next.js App Router scaffold
- Notion-style curation dashboard
- Thai Daily Editorial Board with up to ten ranked stories and 30-day history
- Manual URL intake API
- Unified API ingestion for Hacker News, DEV Community, NewsData.io, The News API, GDELT, NewsAPI.org, GNews, and Mediastack
- Reference Library seeded from public Facebook page snapshots for editorial positioning and style signals
- Lead feedback actions
- Content expansion action
- Rejected queue restore action
- Editorial memory demo state
- Neon Postgres system of record for dashboard state, jobs, and daily boards
- Local Codex CLI worker with retry-safe database jobs
- Windows Task Scheduler installer for the 08:00 Asia/Bangkok run

The hosted app and local worker share Neon Postgres. `lib/demo-store.ts` now contains the existing curation rules while `lib/persistent-store.ts` persists those transitions transactionally.

## API ingestion

The server-side adapters normalize all providers into the same source item shape. Hacker News, DEV Community, and GDELT can run without credentials. The remaining providers read keys from the server environment variables listed in `.env.example`.

Trigger a collection run manually:

```bash
curl -X POST http://localhost:3100/api/intake/apis \
  -H "content-type: application/json" \
  -d '{"query":"AI OR automation OR agent","limit":10}'
```

Check which providers are ready:

```bash
curl http://localhost:3100/api/intake/apis
```

API keys stay server-side and are never returned by the route.

The initial Reference Library is exposed at `GET /api/knowledge-base`. It stores short, attributed observations from public page snapshots, not a full copy of Facebook posts.

## Run

```bash
npm install
npm run db:migrate
npm run dev -- --hostname 0.0.0.0 --port 3100
```

Open:

```text
http://localhost:3100
```

Port `3000` was already occupied during initial verification, so `3100` is the working development port for this scaffold.

## Local Codex worker

Process one queued board:

```bash
python3 scripts/local-runner.py --once
```

Run the one-minute queue watcher and the missed-run-safe 08:00 collection:

```bash
python3 scripts/local-runner.py --watch
```

Install and start the Windows scheduled task from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-worker-task.ps1
```

The worker uses the existing Codex CLI login. It does not require an LLM API key. The PC must be powered on and online; a missed daily run starts after the next login or task start.

## Verify

```bash
npm run typecheck
npm run build
```
