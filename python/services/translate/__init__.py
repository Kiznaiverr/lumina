"""Translation providers — pluggable registry.

Each provider module in provider/ exposes:
  translate(text, source, target, config) -> str          (single)
  translate_batch(texts, source, target, config) -> list  (optional, native batch)

Protocol clients (wire formats) live in protocol/ and are shared across
providers that speak the same API. Add a new provider by dropping a module in
provider/ and registering it in PROVIDERS.
"""
from __future__ import annotations

from typing import Callable

from ._base import TranslateError
from .provider import custom, gemini, grok, openrouter

ProviderFn = Callable[[str, str, str, dict], str]
BatchFn = Callable[[list[str], str, str, dict], list[str]]

PROVIDERS: dict[str, ProviderFn] = {
    "custom": custom.translate,
    "openrouter": openrouter.translate,
    "grok": grok.translate,
    "gemini": gemini.translate,
}

BATCH_PROVIDERS: dict[str, BatchFn] = {
    "custom": custom.translate_batch,
    "openrouter": openrouter.translate_batch,
    "grok": grok.translate_batch,
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

    # Re-align per-text metadata (continuity context + segment types) to the
    # filtered payload
    prev_lines = config.get("previousLines") or []
    types = config.get("types") or []
    meta: dict = {}
    if prev_lines:
        meta["previousLines"] = [prev_lines[i] for i, _ in non_empty]
    if types:
        meta["types"] = [types[i] for i, _ in non_empty]
    if meta:
        config = {**config, **meta}

    batch_fn = BATCH_PROVIDERS.get(name)
    if batch_fn is not None:
        translated = batch_fn(payload, source, target, config)
    else:
        fn = PROVIDERS.get(name)
        if fn is None:
            raise TranslateError(f"Unknown translation provider: {name!r}")
        translated = []
        for (i, t) in non_empty:
            seg_config = config
            if prev_lines:
                # Single-call mode: the provider reads previousLines[0]
                seg_config = {**config, "previousLines": [prev_lines[i]]}
            if types:
                seg_config = {**seg_config, "types": [types[i]]}
            translated.append(fn(t, source, target, seg_config))

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
