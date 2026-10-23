"""Authenticated HTTP client for the hosted AI News worker API."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib import error, request


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_APP_URL = "https://ai-news-curation-eta.vercel.app"


def load_worker_env() -> None:
    path = ROOT / ".env.worker.local"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_url(path: str) -> str:
    return f"{os.environ.get('AI_NEWS_APP_URL', DEFAULT_APP_URL).rstrip('/')}{path}"


def _headers() -> dict[str, str]:
    token = os.environ.get("WORKER_TOKEN")
    if not token:
        raise RuntimeError("WORKER_TOKEN is missing from .env.worker.local")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "ai-news-codex-worker/2.0",
    }


def request_json(path: str, method: str = "GET", payload: dict | None = None, allow_empty: bool = False):
    body = None if method == "GET" else json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
    req = request.Request(api_url(path), data=body, headers=_headers(), method=method)
    try:
        with request.urlopen(req, timeout=120) as response:
            if allow_empty and response.status == 204:
                return None
            raw = response.read()
            return json.loads(raw) if raw else None
    except error.HTTPError as exc:
        if allow_empty and exc.code == 204:
            return None
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{path} returned HTTP {exc.code}: {detail[:500]}") from exc


def get_json(path: str, allow_empty: bool = False):
    return request_json(path, "GET", allow_empty=allow_empty)


def post_json(path: str, payload: dict | None = None, allow_empty: bool = False):
    return request_json(path, "POST", payload, allow_empty)
