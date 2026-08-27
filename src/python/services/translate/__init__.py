"""Translation providers — pluggable registry.

Each provider module exposes:
  translate(text, source, target, config) -> str          (single)
  translate_batch(texts, source, target, config) -> list  (optional, native batch)

Add a new provider by dropping a module here and registering it in PROVIDERS.
"""
from __future__ import annotations

from typing import Callable

from ._base import TranslateError
from . import custom, gemini

ProviderFn = Callable[[str, str, str, dict], str]
BatchFn = Callable[[list[str], str, str, dict], list[str]]

# "custom", "openrouter" and "grok" all share the OpenAI/Anthropic-compatible
# client (services/translate/custom.py) — only the endpoint/style differ.
PROVIDERS: dict[str, ProviderFn] = {
    "custom": custom.translate,
    "openrouter": custom.translate,
    "grok": custom.translate,
    "gemini": gemini.translate,
}

BATCH_PROVIDERS: dict[str, BatchFn] = {
    "custom": custom.translate_batch,
    "openrouter": custom.translate_batch,
    "grok": custom.translate_batch,
    "gemini": gemini.translate_batch,
}


def _provider_name(config: dict) -> str:
    name = (config.get("provider") or "").lower()
    # Legacy key — the generic provider was renamed llm -> custom
    return "custom" if name == "llm" else name


def _normalize_source(config: dict) -> str:
    """"auto" or empty -> "" so the prompt tells the model to detect it."""
    source = (config.get("sourceLang") or "auto").strip()
    return "" if source.lower() == "auto" else source


def translate_text(text: str, config: dict) -> str:
    name = _provider_name(config)
    fn = PROVIDERS.get(name)
    if fn is None:
        raise TranslateError(f"Unknown translation provider: {name!r}")
    return fn(text, _normalize_source(config), config.get("targetLang") or "en", config)


def translate_texts(texts: list[str], config: dict) -> list[str]:
    """Translate a list of texts — native batch if the provider supports it,
    otherwise per-text loop."""
    name = _provider_name(config)
    source = _normalize_source(config)
    target = config.get("targetLang") or "en"

    # Keep empty texts out of the API call; restore them positionally after.
    non_empty = [(i, t) for i, t in enumerate(texts) if t.strip()]
    if not non_empty:
        return [""] * len(texts)

    payload = [t for _, t in non_empty]

    batch_fn = BATCH_PROVIDERS.get(name)
    if batch_fn is not None:
        translated = batch_fn(payload, source, target, config)
    else:
        fn = PROVIDERS.get(name)
        if fn is None:
            raise TranslateError(f"Unknown translation provider: {name!r}")
        translated = [fn(t, source, target, config) for t in payload]

    results = [""] * len(texts)
    for (i, _), tr in zip(non_empty, translated):
        results[i] = tr
    return results


__all__ = [
    "TranslateError",
    "translate_text",
    "translate_texts",
    "PROVIDERS",
    "BATCH_PROVIDERS",
]
