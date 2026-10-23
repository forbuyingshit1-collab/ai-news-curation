"""Bounded, SSRF-safe source extraction for article URLs."""

from __future__ import annotations

import ipaddress
import re
import socket
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
import trafilatura


TIMEOUT_SECONDS = 15
DNS_TIMEOUT_SECONDS = 5
MAX_BYTES = 2_000_000
MIN_TEXT_CHARS = 600
USER_AGENT = "AI-News-Curation/1.0 (local read-only source enrichment)"


def validate_public_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("only public HTTP(S) URLs are allowed")
    if parsed.username or parsed.password:
        raise ValueError("URL credentials are not allowed")
    previous_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(DNS_TIMEOUT_SECONDS)
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise ValueError("hostname could not be resolved") from exc
    finally:
        socket.setdefaulttimeout(previous_timeout)
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("URL resolves to a non-public address")
    return value


def canonicalize(value: str) -> str:
    parsed = urlsplit(value)
    query_parts = []
    for part in parsed.query.split("&") if parsed.query else []:
        key = part.split("=", 1)[0].lower()
        if key.startswith("utm_") or key in {"fbclid", "gclid", "mc_cid", "mc_eid"}:
            continue
        query_parts.append(part)
    path = parsed.path.rstrip("/") or "/"
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, "&".join(query_parts), ""))


def _http_download(url: str) -> tuple[str, str]:
    session = requests.Session()
    current = url
    for _ in range(6):
        validate_public_url(current)
        response = session.get(
            current, allow_redirects=False, stream=True,
            timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT},
        )
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location")
            if not location:
                raise RuntimeError("redirect response has no Location")
            current = urljoin(current, location)
            continue
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if "html" not in content_type and not content_type.startswith("text/"):
            raise RuntimeError(f"unsupported content type: {content_type or 'unknown'}")
        chunks = []
        size = 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise RuntimeError("source response exceeded 2 MB")
            chunks.append(chunk)
        response.encoding = response.encoding or response.apparent_encoding or "utf-8"
        return b"".join(chunks).decode(response.encoding, errors="replace"), current
    raise RuntimeError("too many redirects")


def _playwright_extract(url: str) -> tuple[str, str]:
    from playwright.sync_api import sync_playwright

    validate_public_url(url)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            response = page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_SECONDS * 1000)
            if response:
                validate_public_url(response.url)
            page.wait_for_timeout(1500)
            text = page.locator("body").inner_text(timeout=5000)
            return re.sub(r"\n{3,}", "\n\n", text).strip(), page.url
        finally:
            browser.close()


def extract_item(item: dict) -> dict:
    url = item["sourceUrl"]
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            html, final_url = _http_download(url)
            text = trafilatura.extract(
                html, url=final_url, include_comments=False,
                include_tables=False, favor_precision=True,
            ) or ""
            method = "http"
            if len(text) < MIN_TEXT_CHARS:
                raise RuntimeError("source did not expose enough readable article text")
            evidence = text[:12000]
            return {
                "rawItemId": item["id"],
                "status": "succeeded",
                "canonicalUrl": canonicalize(final_url),
                "extractionMethod": method,
                "evidenceText": evidence,
                "claims": [],
                "limitations": (["Evidence truncated to 12,000 characters"] if len(text) > 12000 else []),
            }
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    return {
        "rawItemId": item["id"],
        "status": "failed",
        "error": str(last_error or "source extraction failed")[:1000],
    }
