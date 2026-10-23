"""Read-only Gmail newsletter intake for the dedicated mailbox."""

from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup
import httplib2
from google.auth.transport.requests import Request
from google_auth_httplib2 import AuthorizedHttp
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from codex_tasks import segment_newsletter


ROOT = Path(__file__).resolve().parents[1]
SECRETS = ROOT / ".secrets"
CLIENT_FILE = SECRETS / "google-oauth-client.json"
TOKEN_FILE = SECRETS / "gmail-token.json"
CHECKPOINT_FILE = SECRETS / "gmail-checkpoint.json"
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
MAX_BACKFILL_MESSAGES = 120
GMAIL_HTTP_TIMEOUT_SECONDS = 30

SYSTEM_RE = re.compile(
    r"\b(otp|one[ -]?time password|verification code|security alert|password reset|"
    r"delivery (?:status|failure)|undeliverable|mail delivery subsystem|confirm your (?:email|account))\b",
    re.IGNORECASE,
)
EXCLUDED_HOSTS = {
    "facebook.com", "www.facebook.com", "x.com", "twitter.com", "instagram.com",
    "linkedin.com", "youtube.com", "tiktok.com",
}
EXCLUDED_LINK_RE = re.compile(
    r"unsubscribe|manage preferences|email preferences|view in browser|privacy|terms|sign[ -]?in|log[ -]?in",
    re.IGNORECASE,
)


def credentials(interactive: bool = False) -> Credentials:
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not interactive:
            raise RuntimeError("Gmail is not authorized. Run: python scripts/local-runner.py --gmail-auth")
        if not CLIENT_FILE.exists():
            raise RuntimeError(f"Google Desktop OAuth credentials are missing: {CLIENT_FILE}")
        SECRETS.mkdir(exist_ok=True)
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_FILE), SCOPES)
        # Use a stable callback port and print the URL so OAuth can be completed
        # in the user's already-authenticated browser profile.
        creds = flow.run_local_server(
            host="localhost",
            port=8765,
            open_browser=False,
            authorization_prompt_message="Open this URL in your browser:\n{url}\n",
            access_type="offline",
            prompt="consent",
        )
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return creds


def authorize() -> None:
    credentials(interactive=True)
    print("Gmail read-only authorization saved locally.", flush=True)


def _decode(value: str | None) -> str:
    if not value:
        return ""
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8", errors="replace")


def _mime_bodies(payload: dict) -> tuple[list[str], list[str]]:
    html: list[str] = []
    plain: list[str] = []

    def visit(part: dict) -> None:
        mime = part.get("mimeType", "")
        content = _decode(part.get("body", {}).get("data"))
        if content and mime == "text/html":
            html.append(content)
        elif content and mime == "text/plain":
            plain.append(content)
        for child in part.get("parts", []):
            visit(child)

    visit(payload)
    return html, plain


def _clean_content(html_parts: list[str], plain_parts: list[str]) -> tuple[str, list[dict[str, str]]]:
    links: list[dict[str, str]] = []
    text_parts: list[str] = []
    for html in html_parts:
        soup = BeautifulSoup(html, "html.parser")
        for node in soup(["script", "style", "noscript"]):
            node.decompose()
        text_parts.append(soup.get_text("\n", strip=True))
        for anchor in soup.find_all("a", href=True):
            url = anchor["href"].strip()
            label = anchor.get_text(" ", strip=True)[:300]
            try:
                parsed = urlparse(url)
            except ValueError:
                continue
            if parsed.scheme not in {"http", "https"} or parsed.hostname in EXCLUDED_HOSTS:
                continue
            if EXCLUDED_LINK_RE.search(f"{label} {url}"):
                continue
            if not any(item["url"] == url for item in links):
                links.append({"url": url, "label": label})
    if not text_parts:
        text_parts.extend(plain_parts)
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(text_parts)).strip()
    return text[:30000], links[:100]


def _headers(payload: dict) -> dict[str, str]:
    return {item["name"].lower(): item["value"] for item in payload.get("headers", [])}


def _sent_at(headers: dict[str, str], internal_ms: int) -> str:
    try:
        parsed = parsedate_to_datetime(headers.get("date", ""))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OverflowError):
        return datetime.fromtimestamp(internal_ms / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def _query() -> str:
    if not CHECKPOINT_FILE.exists():
        return "newer_than:7d"
    try:
        state = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
        after_seconds = max(0, int(state["lastInternalMs"]) // 1000 - 300)
        return f"after:{after_seconds}"
    except (KeyError, ValueError, json.JSONDecodeError):
        return "newer_than:7d"


def _gmail_service():
    creds = credentials()
    http = AuthorizedHttp(creds, http=httplib2.Http(timeout=GMAIL_HTTP_TIMEOUT_SECONDS))
    return build("gmail", "v1", http=http, cache_discovery=False)


def collect_editions() -> tuple[list[dict], int | None]:
    service = _gmail_service()
    ids: list[dict] = []
    token = None
    while len(ids) < MAX_BACKFILL_MESSAGES:
        response = service.users().messages().list(
            userId="me", q=_query(),
            maxResults=min(100, MAX_BACKFILL_MESSAGES - len(ids)), pageToken=token
        ).execute(num_retries=1)
        ids.extend(response.get("messages", []))
        token = response.get("nextPageToken")
        if not token:
            break

    print(f"Gmail found {len(ids)} messages for newsletter backfill", flush=True)

    editions: list[dict] = []
    latest_ms: int | None = None
    for index, item in enumerate(ids, start=1):
        print(f"Gmail processing message {index}/{len(ids)}", flush=True)
        message = service.users().messages().get(
            userId="me", id=item["id"], format="full"
        ).execute(num_retries=1)
        internal_ms = int(message.get("internalDate", "0"))
        latest_ms = max(latest_ms or 0, internal_ms)
        payload = message.get("payload", {})
        headers = _headers(payload)
        html_parts, plain_parts = _mime_bodies(payload)
        text, links = _clean_content(html_parts, plain_parts)
        subject = headers.get("subject", "(no subject)")
        sender = headers.get("from", "Unknown sender")
        system_message = bool(SYSTEM_RE.search(f"{subject}\n{sender}\n{text[:2000]}"))
        if system_message:
            stories = []
        else:
            try:
                stories = segment_newsletter(subject, sender, text, links)
            except Exception as exc:
                # One malformed or unusually large newsletter must not block the rest.
                print(f"Gmail newsletter segmentation skipped message {index}: {exc}", flush=True)
                stories = []
        clean_stories = []
        for story in stories:
            title = str(story.get("title", "")).strip()[:400]
            url = story.get("primaryUrl")
            if not title:
                continue
            if url:
                parsed_url = urlparse(str(url))
                if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
                    continue
                url = str(url)[:1800]
            clean_stories.append({
                "title": title,
                **({"primaryUrl": url} if url else {}),
                # Leave room for JavaScript's UTF-16 length accounting (emoji can count as two).
                "excerpt": str(story.get("excerpt", ""))[:5000],
            })
        edition = {
            "gmailMessageId": message["id"],
            "sender": sender[:400],
            "subject": subject[:800],
            "sentAt": _sent_at(headers, internal_ms),
            "contentExcerpt": text[:5000],
            "ignored": system_message,
            "stories": clean_stories[:30],
        }
        if message.get("threadId"):
            edition["gmailThreadId"] = str(message["threadId"])[:500]
        editions.append(edition)
    return editions, latest_ms


def save_checkpoint(last_internal_ms: int | None) -> None:
    if not last_internal_ms:
        return
    SECRETS.mkdir(exist_ok=True)
    CHECKPOINT_FILE.write_text(json.dumps({"lastInternalMs": last_internal_ms}), encoding="utf-8")
