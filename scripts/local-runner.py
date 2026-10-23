#!/usr/bin/env python3
"""Run Gmail intake, source enrichment, Codex curation, and board generation."""

from __future__ import annotations

import argparse
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

from codex_tasks import curate_batch, generate_board
from gmail_intake import authorize, collect_editions, save_checkpoint
from source_enrichment import extract_item
from worker_api import api_url, get_json, load_worker_env, post_json


WORKER_ID = "anansubagent-local"
CAPABILITIES = ["gmail_readonly", "newsletter_segmentation", "source_enrichment", "codex_curation"]
ENRICHMENT_WINDOW_SECONDS = 30 * 60
HEARTBEAT_INTERVAL_SECONDS = 45
CURATION_SHORTLIST_LIMIT = 24
CURATION_BATCH_SIZE = 2

AI_KEYWORDS = re.compile(
    r"\b(ai|artificial intelligence|llm|gpt|claude|gemini|copilot|agent|model|openai|anthropic)\b|"
    r"ปัญญาประดิษฐ์|เอไอ|โมเดลภาษา|ตัวแทน", re.IGNORECASE
)
HOW_TO_KEYWORDS = re.compile(r"how[ -]?to|tutorial|guide|cookbook|walkthrough|วิธี|สอน|คู่มือ", re.IGNORECASE)
PROMOTIONAL_KEYWORDS = re.compile(r"sponsored|webinar|discount|sale|register now|subscribe", re.IGNORECASE)
OFFICIAL_SOURCES = ("openai", "anthropic", "google", "microsoft", "meta", "aws", "nvidia", "huggingface")


def heartbeat(job_id: str | None = None) -> None:
    post_json("/api/worker/heartbeat", {"workerId": WORKER_ID, "capabilities": CAPABILITIES})
    if job_id:
        post_json(f"/api/jobs/{job_id}/heartbeat", {})


def start_heartbeat_pump(job_id: str) -> tuple[threading.Event, threading.Thread]:
    stop = threading.Event()

    def pump() -> None:
        while not stop.wait(HEARTBEAT_INTERVAL_SECONDS):
            try:
                heartbeat(job_id)
            except Exception as exc:
                print(f"Background heartbeat failed: {exc}", flush=True)

    thread = threading.Thread(target=pump, name="worker-heartbeat", daemon=True)
    thread.start()
    return stop, thread


def _chunks(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _title_key(value: str) -> str:
    return re.sub(r"[^a-z0-9ก-๙]+", "", value.lower())[:180]


def _candidate_score(item: dict) -> int:
    text = " ".join(str(item.get(key, "")) for key in ("title", "publisher", "sourceUrl", "providerExcerpt"))
    score = 0
    if any(source in text.lower() for source in OFFICIAL_SOURCES):
        score += 35
    if AI_KEYWORDS.search(text):
        score += 30
    if HOW_TO_KEYWORDS.search(text):
        score += 18
    if len(str(item.get("evidenceText", ""))) >= 800:
        score += 10
    if item.get("publishedAt"):
        score += 7
    if PROMOTIONAL_KEYWORDS.search(text):
        score -= 25
    return score


def _automatic_rejection(item: dict, score: int, reason: str) -> dict:
    title = str(item.get("title", "ข่าวจากแหล่งข้อมูล"))[:500]
    return {
        "rawItemIds": [item["rawItemId"]],
        "disposition": "rejected",
        "title": title,
        "leadBriefTh": "ระบบคัดออกในรอบแรก เนื่องจากสัญญาณความเกี่ยวข้องหรือหลักฐานยังไม่เพียงพอสำหรับทำคอนเทนต์.",
        "whyItMattersTh": "เก็บไว้เป็นข้อมูลอ้างอิงได้ แต่ไม่ควรใช้เป็นหัวข้อหลักของเพจในรอบนี้.",
        "verifyNextTh": "พิจารณาใหม่เมื่อมีแหล่งข้อมูลหลักหรือรายละเอียดที่ชัดเจนขึ้น.",
        "rejectionReason": reason,
        "confidenceLabel": "low",
        "scores": {
            "audienceFit": max(0, min(100, score)),
            "contentPotential": max(0, min(100, score)),
            "novelty": 20,
            "practicalValue": 20,
            "confidence": 35,
            "ranking": max(0, min(100, score)),
        },
        "topicTags": ["auto-filter"],
    }


def _plan_curation(candidates: list[dict]) -> tuple[list[dict], list[dict]]:
    ranked = sorted(candidates, key=_candidate_score, reverse=True)
    shortlist: list[dict] = []
    auto_rejected: list[dict] = []
    seen_titles: set[str] = set()

    for item in ranked:
        score = _candidate_score(item)
        title_key = _title_key(str(item.get("title", "")))
        if title_key and title_key in seen_titles:
            auto_rejected.append(_automatic_rejection(item, score, "ข่าวซ้ำหรือใกล้เคียงกับรายการที่มีคะแนนสูงกว่า"))
        elif len(shortlist) < CURATION_SHORTLIST_LIMIT:
            shortlist.append(item)
            if title_key:
                seen_titles.add(title_key)
        else:
            auto_rejected.append(_automatic_rejection(item, score, "ไม่ผ่านรอบคัดกรองเบื้องต้นเมื่อเทียบกับข่าวที่มีสัญญาณสูงกว่า"))
    return shortlist, auto_rejected


def _save_snapshots(run_id: str, snapshots: list[dict]) -> None:
    """Save valid snapshots while isolating any malformed extractor result."""
    for batch in _chunks(snapshots, 100):
        try:
            post_json(f"/api/worker/runs/{run_id}/snapshots", {"snapshots": batch})
            continue
        except Exception as batch_error:
            print(f"[{run_id}] Snapshot batch rejected; retrying items individually: {batch_error}", flush=True)

        for snapshot in batch:
            try:
                post_json(f"/api/worker/runs/{run_id}/snapshots", {"snapshots": [snapshot]})
            except Exception as item_error:
                failed = {
                    "rawItemId": snapshot.get("rawItemId"),
                    "status": "failed",
                    "error": f"snapshot validation failed: {item_error}"[:1000],
                }
                post_json(f"/api/worker/runs/{run_id}/snapshots", {"snapshots": [failed]})


def process_collection(job: dict) -> None:
    run_id = job.get("collectionRunId") or job.get("payload", {}).get("collectionRunId")
    if not run_id:
        raise RuntimeError("process_collection job has no collectionRunId")

    started = time.monotonic()
    heartbeat()
    print(f"[{run_id}] Reading Gmail newsletters", flush=True)
    try:
        editions, latest_internal_ms = collect_editions()
        newsletter_result = post_json(f"/api/worker/runs/{run_id}/newsletters", {"editions": editions})
        save_checkpoint(latest_internal_ms)
        print(
            f"[{run_id}] Gmail: {newsletter_result['editionCount']} editions, "
            f"{newsletter_result['storyCount']} stories",
            flush=True,
        )
    except Exception as exc:
        # Gmail is an additional source. A transient mailbox/API failure must not
        # prevent already-collected API news from reaching the daily board.
        print(f"[{run_id}] Gmail skipped: {exc}", flush=True)

    heartbeat()
    items = get_json(f"/api/worker/runs/{run_id}/items").get("items", [])
    print(f"[{run_id}] Enriching {len(items)} source URLs with concurrency 12", flush=True)
    snapshots: list[dict] = []
    with ThreadPoolExecutor(max_workers=12, thread_name_prefix="source") as executor:
        futures = {executor.submit(extract_item, item): item for item in items}
        for future in as_completed(futures):
            if time.monotonic() - started > ENRICHMENT_WINDOW_SECONDS:
                for pending in futures:
                    pending.cancel()
                raise TimeoutError("source enrichment exceeded the 30-minute run window")
            try:
                snapshots.append(future.result())
            except Exception as exc:
                snapshots.append({
                    "rawItemId": futures[future]["id"],
                    "status": "failed",
                    "error": str(exc)[:1000],
                })
    _save_snapshots(run_id, snapshots)

    heartbeat()
    curation = get_json(f"/api/worker/runs/{run_id}/curation")
    candidates = curation.get("items", [])
    shortlist, auto_rejected = _plan_curation(candidates)
    print(
        f"[{run_id}] Curation prefilter kept {len(shortlist)}/{len(candidates)}; "
        f"auto-rejected {len(auto_rejected)}",
        flush=True,
    )
    for batch in _chunks(auto_rejected, 50):
        post_json(f"/api/worker/runs/{run_id}/curation", {"decisions": batch})
    print(f"[{run_id}] Curating shortlist in batches of {CURATION_BATCH_SIZE}", flush=True)
    for batch in _chunks(shortlist, CURATION_BATCH_SIZE):
        decisions = curate_batch(
            batch,
            curation.get("editorialPreferences", []),
            curation.get("referenceLibrary", []),
            curation.get("editorialPlaybooks", []),
        )
        post_json(f"/api/worker/runs/{run_id}/curation", {"decisions": decisions})
        heartbeat()

    result = post_json(f"/api/worker/runs/{run_id}/finalize")
    post_json(f"/api/worker/jobs/{job['id']}/complete")
    print(f"[{run_id}] Collection finalized (partial={result['partial']})", flush=True)


def process_board(job: dict) -> None:
    print(f"Claimed board job {job['id']} (attempt {job['attempts']})", flush=True)
    result = generate_board(job)
    completed = post_json(f"/api/jobs/{job['id']}/complete", result)
    print(f"Completed board {completed['boardId']} with {completed['generatedCount']} items", flush=True)


def process_one() -> bool:
    heartbeat()
    job = post_json("/api/jobs/claim", allow_empty=True)
    if not job:
        return False
    print(f"Claimed {job['type']} job {job['id']} (attempt {job['attempts']})", flush=True)
    heartbeat_stop, heartbeat_thread = start_heartbeat_pump(job["id"])
    try:
        if job["type"] == "process_collection":
            process_collection(job)
        elif job["type"] == "generate_daily_board":
            process_board(job)
        else:
            raise RuntimeError(f"unsupported job type: {job['type']}")
    except Exception as exc:
        message = str(exc)
        print(f"Job {job['id']} failed: {message}", flush=True)
        try:
            post_json(f"/api/jobs/{job['id']}/fail", {"error": message[:1000]})
        except Exception as report_error:
            print(f"Could not report failure: {report_error}", flush=True)
    finally:
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=1)
    return True


def trigger_daily_if_due(last_triggered_date: str | None) -> str | None:
    now = datetime.now(ZoneInfo("Asia/Bangkok"))
    today = now.date().isoformat()
    if now.hour < 8 or last_triggered_date == today:
        return last_triggered_date
    result = post_json("/api/automation/daily")
    state = "already completed" if result.get("alreadyRan") else "started"
    print(f"Scheduled collection for {today}: {state}", flush=True)
    return today


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process one queued job and exit")
    parser.add_argument("--watch", action="store_true", help="Poll every minute and run the 08:00 collection")
    parser.add_argument("--gmail-auth", action="store_true", help="Authorize read-only Gmail access")
    args = parser.parse_args()
    load_worker_env()

    if args.gmail_auth:
        authorize()
        return 0
    if args.once or not args.watch:
        process_one()
        return 0

    print(f"Watching {api_url('')} every 60 seconds", flush=True)
    last_triggered_date: str | None = None
    while True:
        try:
            last_triggered_date = trigger_daily_if_due(last_triggered_date)
            while process_one():
                pass
        except Exception as exc:
            print(f"Worker loop error: {exc}", file=sys.stderr, flush=True)
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())
