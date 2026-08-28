"""Anthropic Messages API client (official anthropic SDK).

Uses the official SDK like the OpenAI one — httpx-based, so Cloudflare-
protected endpoints are not blocked (raw urllib gets HTTP 403 error 1010).
"""
from __future__ import annotations

import re

from anthropic import APIError, Anthropic

from utils.logger import log

from .._base import TranslateError


def chat(base_url: str, api_key: str, model: str, system: str, user: str) -> str:
    log.debug(f"Anthropic chat request: {base_url} model={model}")
    client = Anthropic(
        base_url=base_url.rstrip("/"),
        # Local servers accept any placeholder key
        api_key=api_key or "not-needed",
        timeout=30.0,
    )
    try:
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except APIError as e:
        raise TranslateError(f"Anthropic request failed: {e}") from e
    out = "".join(
        block.text for block in message.content if block.type == "text"
    ).strip()
    if not out:
        raise TranslateError("Anthropic returned no content")
    return re.sub(r'^["\u201c\u300d]+|["\u201d\u300d]+$', "", out).strip()
