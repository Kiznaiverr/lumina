"""OpenAI-compatible chat completions client (official openai SDK).
"""
from __future__ import annotations

import re

from openai import APIError, OpenAI

from utils.logger import log

from .._base import TranslateError


def chat(base_url: str, api_key: str, model: str, system: str, user: str) -> str:
    log.debug(f"LLM chat request: {base_url} model={model}")
    client = OpenAI(
        base_url=base_url.rstrip("/"),
        # Local servers (Ollama, LM Studio, ...) accept any placeholder key
        api_key=api_key or "not-needed",
        timeout=30.0,
    )
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
        )
    except APIError as e:
        raise TranslateError(f"LLM request failed: {e}") from e
    content = (completion.choices[0].message.content or "").strip()
    # Strip wrapping quotes some models add
    return re.sub(r'^["\u201c\u300c]+|["\u201d\u300d]+$', "", content).strip()
