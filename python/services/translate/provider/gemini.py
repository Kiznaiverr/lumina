"""Google Gemini — batch translation via the generateContent API."""
from __future__ import annotations

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_system_instruction,
    http_post_json,
    parse_batch_response,
)

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def translate_batch(
    texts: list[str], target: str, config: dict
) -> list[str]:
    api_key = config.get("geminiApiKey") or ""
    model = config.get("geminiModel") or "gemini-3.5-flash-lite"
    if not api_key:
        raise TranslateError("Gemini API key not configured")

    system = build_system_instruction(config, target, previous_line="")
    user = build_batch_prompt(
        texts,
        target,
        previous_lines=config.get("previousLines"),
        types=config.get("types"),
    )

    url = f"{_API_BASE}/models/{model}:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
        },
    }
    try:
        result = http_post_json(url, body)
    except Exception as e:
        raise TranslateError(f"Gemini request failed: {e}") from e

    candidates = result.get("candidates") or []
    if not candidates:
        raise TranslateError(f"Gemini returned no candidates: {result}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    raw = "".join(p.get("text", "") for p in parts).strip()
    return parse_batch_response(raw, len(texts), label="Gemini")


def translate(text: str, target: str, config: dict) -> str:
    return translate_batch([text], target, config)[0]
