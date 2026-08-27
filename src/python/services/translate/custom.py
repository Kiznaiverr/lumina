"""Custom LLM provider — OpenAI-compatible or Anthropic-compatible chat APIs.

Serves three provider presets from the registry:
  custom      — any base URL; API style chosen in settings (openai | anthropic)
  openrouter  — https://openrouter.ai/api/v1 (OpenAI-compatible)
  grok        — https://api.x.ai/v1 (OpenAI-compatible)

Config keys (shared with the renderer):
  llmBaseUrl, llmApiKey, llmModel, llmStyle ("openai" | "anthropic"), llmInstruction
  openrouterApiKey, openrouterModel  — OpenRouter preset
  grokApiKey, grokModel              — Grok preset
"""
from __future__ import annotations

import re
from pathlib import Path

from ._base import TranslateError, http_post_json

# Preset endpoints for providers that reuse this client. "custom" instead
# reads llmBaseUrl + llmStyle from the settings config.
_PRESETS: dict[str, dict[str, str]] = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "style": "openai",
        "key": "openrouterApiKey",
        "model": "openrouterModel",
    },
    "grok": {
        "base_url": "https://api.x.ai/v1",
        "style": "openai",
        "key": "grokApiKey",
        "model": "grokModel",
    },
}

# Default instruction lives in prompts/translate-default.md.
# {target} placeholder is replaced with the target language at request time.
_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"


def load_default_instruction() -> str:
    try:
        return (_PROMPTS_DIR / "translate-default.md").read_text(encoding="utf-8")
    except OSError: 
        return "Translate the given text into {target}. Output ONLY the translation."


def _extract_content(content) -> str:
    """Extract plain text from a chat completion content field."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                if isinstance(part.get("text"), str):
                    parts.append(part["text"])
                elif isinstance(part.get("content"), str):
                    parts.append(part["content"])
        return "".join(parts)
    return "" if content is None else str(content)


def _render_template(template: str, values: dict) -> str:
    """Replace {{key}} placeholders; missing keys become empty strings."""
    out = template
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", str(value or ""))
    # Strip any leftover unknown placeholders
    return re.sub(r"\{\{\w+\}\}", "", out)


def _resolve(config: dict) -> tuple[str, str, str, str]:
    """(base_url, style, api_key, model) from config — presets win over fields.

    Each preset reads its own key/model fields; llmApiKey/llmModel act as a
    fallback for legacy configs saved before per-provider keys existed.
    """
    provider = (config.get("provider") or "").lower()
    preset = _PRESETS.get(provider)
    if preset:
        return (
            preset["base_url"],
            preset["style"],
            config.get(preset["key"]) or config.get("llmApiKey") or "",
            config.get(preset["model"]) or config.get("llmModel") or "",
        )
    style = (config.get("llmStyle") or "openai").lower()
    return (
        config.get("llmBaseUrl") or "",
        style,
        config.get("llmApiKey") or "",
        config.get("llmModel") or "",
    )


def _chat_openai(base_url: str, api_key: str, model: str, system: str, user: str) -> str:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        result = http_post_json(
            base_url.rstrip("/") + "/chat/completions", body, headers
        )
    except Exception as e:
        raise TranslateError(f"LLM request failed: {e}") from e
    choices = result.get("choices") or []
    if not choices:
        raise TranslateError(f"LLM returned no choices: {result}")
    message = choices[0].get("message") or {}
    out = _extract_content(message.get("content")).strip()
    # Strip wrapping quotes some models add
    return re.sub(r'^["\u201c\u300c]+|["\u201d\u300d]+$', "", out).strip()


def _chat_anthropic(base_url: str, api_key: str, model: str, system: str, user: str) -> str:
    body = {
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": 0.3,
    }
    headers = {"anthropic-version": "2023-06-01"}
    if api_key:
        headers["x-api-key"] = api_key
    try:
        result = http_post_json(base_url.rstrip("/") + "/v1/messages", body, headers)
    except Exception as e:
        raise TranslateError(f"Anthropic request failed: {e}") from e
    content = result.get("content") or []
    out = "".join(
        p.get("text", "") for p in content if isinstance(p, dict)
    ).strip()
    if not out:
        raise TranslateError(f"Anthropic returned no content: {result}")
    return re.sub(r'^["\u201c\u300d]+|["\u201d\u300d]+$', "", out).strip()


def _chat(base_url: str, api_key: str, model: str, style: str, system: str, user: str) -> str:
    if style == "anthropic":
        return _chat_anthropic(base_url, api_key, model, system, user)
    return _chat_openai(base_url, api_key, model, system, user)


def translate(text: str, source: str, target: str, config: dict) -> str:
    base_url, style, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")

    system = _render_template(
        config.get("llmInstruction") or load_default_instruction(),
        {
            "target_language": target,
            "source_language": source,
            "previous_line": config.get("previousLine") or "",
        },
    )
    user = f"Target language: {target}\n\nText:\n{text}"
    return _chat(base_url, api_key, model, style, system, user)


def translate_batch(
    texts: list[str], source: str, target: str, config: dict
) -> list[str]:
    """Translate all texts in ONE chat completion using a numbered list."""
    base_url, style, api_key, model = _resolve(config)
    if not base_url:
        raise TranslateError("LLM base URL not configured")
    if not model:
        raise TranslateError("LLM model not configured")

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
    raw = _chat(base_url, api_key, model, style, system, user)

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
            f"LLM batch response missing translations for indices: {missing}"
        )
    return results
