"""OpenRouter — OpenAI-compatible chat at a fixed endpoint, own key + model."""
from __future__ import annotations

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_single_prompt,
    build_system_instruction,
    parse_numbered_batch,
)
from ..protocol.openai import chat

_BASE_URL = "https://openrouter.ai/api/v1"


def _resolve(config: dict) -> tuple[str, str, str]:
    """(base_url, api_key, model) — own key/model fields only."""
    return (
        _BASE_URL,
        config.get("openrouterApiKey") or "",
        config.get("openrouterModel") or "",
    )


def translate(text: str, source: str, target: str, config: dict) -> str:
    base_url, api_key, model = _resolve(config)
    if not model:
        raise TranslateError("LLM model not configured")
    system = build_system_instruction(config, target, source)
    return chat(base_url, api_key, model, system, build_single_prompt(text, target))


def translate_batch(
    texts: list[str], source: str, target: str, config: dict
) -> list[str]:
    base_url, api_key, model = _resolve(config)
    if not model:
        raise TranslateError("LLM model not configured")
    system = build_system_instruction(config, target, source, previous_line="")
    raw = chat(base_url, api_key, model, system, build_batch_prompt(texts, target))
    return parse_numbered_batch(raw, len(texts))
