"""OpenAI-compatible chat completions client (official openai SDK).
"""
from __future__ import annotations

import re

from openai import APIError, OpenAI

from utils.logger import log

from .._base import TranslateError


def chat(
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    json_mode: bool = False,
) -> str:
    log.debug(f"LLM chat request: {base_url} model={model}")
    client = OpenAI(
        base_url=base_url.rstrip("/"),
        # Local servers (Ollama, LM Studio, ...) accept any placeholder key
        api_key=api_key or "not-needed",
        timeout=30.0,
    )

    def _create(json: bool):
        kwargs = {}
        if json:
            kwargs["response_format"] = {"type": "json_object"}
        return client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            **kwargs,
        )

    try:
        completion = _create(json_mode)
    except APIError as e:
        if not json_mode:
            raise TranslateError(f"LLM request failed: {e}") from e
        # Local servers / some models reject response_format — retry plain
        log.warn(f"JSON mode rejected by endpoint ({e}) — retrying without")
        try:
            completion = _create(False)
        except APIError as e2:
            raise TranslateError(f"LLM request failed: {e2}") from e2
    content = (completion.choices[0].message.content or "").strip()
    # Strip wrapping quotes some models add
    return re.sub(r'^["\u201c\u300c]+|["\u201d\u300d]+$', "", content).strip()
