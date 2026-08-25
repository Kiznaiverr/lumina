"""Translation providers — pluggable registry.

Each provider module exposes:
  translate(text, source, target, config) -> str          (single)
  translate_batch(texts, source, target, config) -> list  (optional, native batch)

Add a new provider by dropping a module here and registering it in PROVIDERS.
"""
from __future__ import annotations

from typing import Callable

from ._base import TranslateError
from . import gemini, llm

ProviderFn = Callable[[str, str, str, dict], str]
BatchFn = Callable[[list[str], str, str, dict], list[str]]

PROVIDERS: dict[str, ProviderFn] = {
    "llm": llm.translate,
    "gemini": gemini.translate,
}

BATCH_PROVIDERS: dict[str, BatchFn] = {
    "llm": llm.translate_batch,
    "gemini": gemini.translate_batch,
}


def _provider_name(config: dict) -> str:
    return (config.get("provider") or "").lower()


def translate_text(text: str, config: dict) -> str:
    name = _provider_name(config)
    fn = PROVIDERS.get(name)
    if fn is None:
        raise TranslateError(f"Unknown translation provider: {name!r}")
    return fn(text, config.get("sourceLang") or "ja", config.get("targetLang") or "en", config)


def translate_texts(texts: list[str], config: dict) -> list[str]:
    """Translate a list of texts — native batch if the provider supports it,
    otherwise per-text loop."""
    name = _provider_name(config)
    source = config.get("sourceLang") or "ja"
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


def translate_text(text: str, config: dict) -> str:
    provider = (config.get("provider") or "").lower()
    source = config.get("sourceLang") or "ja"
    target = config.get("targetLang") or "en"
    fn = PROVIDERS.get(provider)
    if fn is None:
        raise TranslateError(f"Unknown translation provider: {provider!r}")
    return fn(text, source, target, config)


__all__ = ["TranslateError", "translate_text", "PROVIDERS"]
