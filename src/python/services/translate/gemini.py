"""Google Gemini — batch translation via generateContent API."""
from __future__ import annotations

import re
from pathlib import Path

from ._base import TranslateError, http_post_json
from .custom import _render_template, load_default_instruction

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def translate_batch(
    texts: list[str], source: str, target: str, config: dict
) -> list[str]:
    api_key = config.get("geminiApiKey") or ""
    model = config.get("geminiModel") or "gemini-2.0-flash"
    if not api_key:
        raise TranslateError("Gemini API key not configured")

    system = _render_template(
        config.get("llmInstruction") or load_default_instruction(),
        {
            "target_language": target,
            "source_language": source,
            "previous_line": "",
        },
    )
    numbered = "\n".join(f"[{i}] {t}" for i, t in enumerate(texts))
    user = (
        f"Target language: {target}\n\n"
        "The input is a numbered list of independent text segments "
        "(speech bubbles on one manga page). Translate EACH line independently.\n"
        "Output ONLY a numbered list in the same format with the same indices:\n"
        "[0] translation of line 0\n"
        "[1] translation of line 1\n\n"
        f"{numbered}"
    )

    url = f"{_API_BASE}/models/{model}:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.3},
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

    # Parse "[i] text" lines back into a result array
    results: list[str] = [""] * len(texts)
    seen = [False] * len(texts)
    pattern = re.compile(r"^\s*[\[\(]?(\d+)[\]\)]?\s*[.:\-]?\s*(.*)$")
    for line in raw.splitlines():
        m = pattern.match(line)
        if not m:
            continue
        idx = int(m.group(1))
        val = m.group(2).strip()
        if 0 <= idx < len(texts) and not seen[idx]:
            results[idx] = val
            seen[idx] = True

    missing = [i for i, ok in enumerate(seen) if not ok]
    if missing:
        raise TranslateError(
            f"Gemini batch response missing translations for indices: {missing}"
        )
    return results


def translate(text: str, source: str, target: str, config: dict) -> str:
    return translate_batch([text], source, target, config)[0]
