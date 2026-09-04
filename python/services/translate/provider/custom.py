"""Custom LLM provider — user-configured base URL, OpenAI- or Anthropic-compatible.

Reads llmBaseUrl + llmStyle from settings and delegates the chat call to the
matching protocol module.
"""
from __future__ import annotations

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_single_prompt,
    build_system_instruction,
    parse_numbered_batch,
)


def _resolve(config: dict) -> tuple[str, str, str, str]:
    """(base_url, style, api_key, model) — plain llm* fields, no presets."""
    style = (config.get("llmStyle") or "openai").lower()
    return (
        config.get("llmBaseUrl") or "",
        style,
        config.get("llmApiKey") or "",
        config.get("llmModel") or "",
    )


def _chat(
    base_url: str, api_key: str, model: str, style: str, system: str, user: str
) -> str:
    # Import only the protocol for the configured style so the other SDK
    # never loads (one provider = one SDK).
    if style == "anthropic":
        from ..protocol.anthropic import chat as chat_anthropic

        return chat_anthropic(base_url, api_key, model, system, user)
    from ..protocol.openai import chat as chat_openai

    return chat_openai(base_url, api_key, model, system, user)


def translate(text: str, source: str, target: str, config: dict) -> str:
    base_url, style, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    system = build_system_instruction(config, target, source)
    return _chat(
        base_url, api_key, model, style, system, build_single_prompt(text, target)
    )


def translate_batch(
    texts: list[str], source: str, target: str, config: dict
) -> list[str]:
    base_url, style, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    system = build_system_instruction(config, target, source, previous_line="")
    raw = _chat(
        base_url,
        api_key,
        model,
        style,
        system,
        build_batch_prompt(
            texts,
            target,
            previous_lines=config.get("previousLines"),
            types=config.get("types"),
        ),
    )
    return parse_numbered_batch(raw, len(texts))
