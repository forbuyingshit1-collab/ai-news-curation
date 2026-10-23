"""Structured Codex CLI tasks used by the local worker."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOARD_SCHEMA = ROOT / "scripts" / "daily-board-output.schema.json"
NEWSLETTER_SCHEMA = ROOT / "scripts" / "newsletter-segmentation.schema.json"
CURATION_SCHEMA = ROOT / "scripts" / "curation-output.schema.json"
CODEX_TIMEOUT_SECONDS = 120


def run_codex_json(prompt: str, schema: Path, attempts: int = 3, timeout_seconds: int | None = None) -> dict:
    last_error: Exception | None = None
    timeout = timeout_seconds or CODEX_TIMEOUT_SECONDS
    for attempt in range(1, attempts + 1):
        try:
            with tempfile.TemporaryDirectory(prefix="ai-news-codex-") as temp_dir:
                output_path = Path(temp_dir) / "result.json"
                command = [
                    "codex", "exec", "--skip-git-repo-check", "--ephemeral",
                    "--sandbox", "read-only", "--output-schema", str(schema),
                    "--output-last-message", str(output_path), "-",
                ]
                process = subprocess.Popen(
                    command, cwd=ROOT, text=True, encoding="utf-8", errors="replace",
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                )
                try:
                    stdout, stderr = process.communicate(input=prompt, timeout=timeout)
                except subprocess.TimeoutExpired as exc:
                    # On Windows, `codex` starts through a .cmd shim. Kill its child tree too,
                    # otherwise a timed-out Node process can survive and block later batches.
                    if sys.platform == "win32":
                        subprocess.run(
                            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
                        )
                    else:
                        process.kill()
                    process.communicate()
                    raise TimeoutError(f"Codex CLI timed out after {timeout} seconds") from exc
                if process.returncode != 0:
                    detail = stderr.strip()[-500:]
                    suffix = f": {detail}" if detail else ""
                    raise RuntimeError(f"Codex CLI exited with code {process.returncode}{suffix}")
                return json.loads(output_path.read_text(encoding="utf-8"))
        except Exception as exc:
            last_error = exc
            print(f"Codex task attempt {attempt}/{attempts} failed: {exc}", file=sys.stderr, flush=True)
    raise RuntimeError(f"Codex task failed after {attempts} attempts: {last_error}")


def segment_newsletter(subject: str, sender: str, text: str, links: list[dict[str, str]]) -> list[dict]:
    prompt = f"""You segment one newsletter edition into distinct editorial stories.

Rules:
- Return only JSON matching the schema.
- Use only a primaryUrl from the observed links below. Never invent or repair a URL.
- Ignore unsubscribe, account, social, sponsor-only, tracking, and navigation links.
- Split distinct news stories. Do not turn every small navigation link into a story.
- Keep useful story excerpts grounded in the supplied newsletter text.
- If there is no substantive editorial story, return an empty stories array.

Sender: {sender}
Subject: {subject}
Newsletter text:
{text[:18000]}

Observed links:
{json.dumps(links[:80], ensure_ascii=False, indent=2)}
"""
    # A single newsletter must not delay the whole daily collection for minutes.
    # Skip malformed editions after two bounded attempts and continue with API news.
    result = run_codex_json(prompt, NEWSLETTER_SCHEMA, attempts=2, timeout_seconds=60)
    allowed = {item["url"] for item in links}
    stories = []
    for story in result.get("stories", []):
        url = story.get("primaryUrl")
        if url and url not in allowed:
            raise RuntimeError("newsletter segmentation returned an unobserved URL")
        stories.append({
            "title": story["title"],
            **({"primaryUrl": url} if url else {}),
            "excerpt": story.get("excerpt", "")[:6000],
        })
    return stories


def curate_batch(items: list[dict], preferences: list[dict], references: list[dict], playbooks: list[dict]) -> list[dict]:
    ids = {item["rawItemId"] for item in items}
    prompt_items = [{
        "rawItemId": item["rawItemId"],
        "title": str(item.get("title", ""))[:400],
        "publisher": str(item.get("publisher", ""))[:200],
        "sourceUrl": str(item.get("sourceUrl", ""))[:1200],
        "publishedAt": item.get("publishedAt"),
        "providerExcerpt": str(item.get("providerExcerpt", ""))[:600],
        "evidenceText": str(item.get("evidenceText", ""))[:1200],
        "limitations": list(item.get("limitations", []))[:4],
    } for item in items]
    prompt_preferences = [
        {"preferenceType": item.get("preferenceType"), "description": str(item.get("description", ""))[:400]}
        for item in preferences[:8]
    ]
    prompt_references = [
        {
            "sourceName": item.get("sourceName"), "title": item.get("title"),
            "summaryTh": str(item.get("summaryTh", ""))[:500],
            "observedSignals": list(item.get("observedSignals", []))[:4],
            "usageGuidanceTh": list(item.get("usageGuidanceTh", []))[:4],
        }
        for item in references[:6]
    ]
    prompt_playbooks = [
        {
            "sourceName": item.get("sourceName"),
            "selectionSignals": list(item.get("selectionSignals", []))[:5],
            "usefulAngles": list(item.get("usefulAngles", []))[:5],
            "guardrails": list(item.get("guardrails", []))[:4],
        }
        for item in playbooks[:4]
    ]
    prompt = f"""You are the curation sub-agent for a Thai AI news editor.

Decide whether every input item should become a content lead or be rejected.
- Return only JSON matching the schema and cover every rawItemId exactly once.
- Cluster items only when they clearly describe the same event. Keep separate when unsure.
- Prefer official/primary evidence, meaningful AI product changes, practical How-to potential,
  novelty, audience fit, and claims supported by the extracted evidence.
- Reference material and editorial playbooks guide topic selection and angles only. Never copy wording
  or treat reference posts as factual evidence for current news.
- Thai fields must be clear enough to understand the event without opening the source. Keep each field to
  one concise useful sentence; the final board generator writes the longer daily summary.
- Reject weak, duplicate, promotional-only, stale, inaccessible, or poorly supported items and explain why.
- For rejected decisions, set leadBriefTh/whyItMattersTh/verifyNextTh to concise explanatory Thai text and
  provide rejectionReason. For leads, rejectionReason must be an empty string.

Editorial preferences:
{json.dumps(prompt_preferences, ensure_ascii=False)}

Reference library:
{json.dumps(prompt_references, ensure_ascii=False)}

Editorial playbooks:
{json.dumps(prompt_playbooks, ensure_ascii=False)}

Candidate evidence:
{json.dumps(prompt_items, ensure_ascii=False, indent=2)}
"""
    decisions = run_codex_json(prompt, CURATION_SCHEMA).get("decisions", [])
    covered = [raw_id for decision in decisions for raw_id in decision.get("rawItemIds", [])]
    if set(covered) != ids or len(covered) != len(ids):
        raise RuntimeError("curation output did not cover every raw item exactly once")
    return decisions


def generate_board(job: dict) -> dict:
    payload = job["payload"]
    compact_candidates = [{
        "contentLeadId": item["contentLeadId"],
        "title": str(item.get("title", ""))[:400],
        "sourceName": str(item.get("sourceName", ""))[:160],
        "sourceUrl": str(item.get("sourceUrl", ""))[:1200],
        "publishedAt": item.get("publishedAt"),
        "sourceExcerpt": str(item.get("sourceExcerpt", ""))[:1000],
        "leadBriefTh": str(item.get("leadBriefTh", ""))[:900],
        "whyItMattersTh": str(item.get("whyItMattersTh", ""))[:650],
        "confidenceLabel": item.get("confidenceLabel"),
        "rankingScore": item.get("rankingScore"),
        "isHowTo": item.get("isHowTo"),
    } for item in payload.get("candidates", [])[:15]]
    compact_payload = {
        "boardDate": payload["boardDate"],
        "timezone": payload["timezone"],
        "expectedCount": min(payload["expectedCount"], len(compact_candidates)),
        "candidates": compact_candidates,
        "editorialPreferences": payload.get("editorialPreferences", [])[:8],
        "referenceLibrary": [{
            "sourceName": item.get("sourceName"), "title": item.get("title"),
            "summaryTh": str(item.get("summaryTh", ""))[:500],
            "observedSignals": list(item.get("observedSignals", []))[:4],
            "usageGuidanceTh": list(item.get("usageGuidanceTh", []))[:4],
        } for item in payload.get("referenceLibrary", [])[:6]],
    }
    prompt = f"""You are the editorial selection worker for an AI news curation dashboard.

Create the Daily Editorial Board for {compact_payload['boardDate']} in Asia/Bangkok.
- Select at most {compact_payload['expectedCount']} items. Do not pad with weak items.
- Rank practical AI use, meaningful changes, novelty, official sources, and editorial fit.
- Write each Thai summary at roughly 120-180 Thai words in one or two paragraphs.
- Explain what happened, context, affected users, implications/limits, and why it matters.
- Ground facts only in candidate evidence. Never invent facts. Return only schema-valid JSON.

Input:
{json.dumps(compact_payload, ensure_ascii=False, indent=2)}
"""
    return run_codex_json(prompt, BOARD_SCHEMA, timeout_seconds=240)
