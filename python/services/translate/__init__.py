"""Translation providers — pluggable registry.

Each provider module in provider/ exposes:
  translate(text, target, config) -> str          (single)
  translate_batch(texts, target, config) -> list  (optional, native batch)

Protocol clients (wire formats) live in protocol/ and are shared across
providers that speak the same API. Add a new provider by dropping a module in
provider/ and registering it in PROVIDERS.
"""
from __future__ import annotations

import importlib
from typing import Callable

from ._base import TranslateError

ProviderFn = Callable[[str, str, dict], str]
BatchFn = Callable[[list[str], str, dict], list[str]]

# Provider modules are imported LAZILY (first use) so the heavy SDK deps
# (openai / anthropic) only load for the provider actually configured.
_PROVIDERS: dict[str, str] = {
    "custom": "custom",
    "openrouter": "openrouter",
    "grok": "grok",
    "gemini": "gemini",
}

_loaded: dict[str, object] = {}


def _provider_module(name: str):
    mod = _loaded.get(name)
    if mod is None:
        mod = importlib.import_module(f".provider.{name}", __package__)
        _loaded[name] = mod
    return mod


def _provider_fn(name: str) -> ProviderFn:
    return _provider_module(name).translate


def _batch_fn(name: str) -> BatchFn | None:
    return getattr(_provider_module(name), "translate_batch", None)


def _provider_name(config: dict) -> str:
    name = (config.get("provider") or "").lower()
    # Legacy key — the generic provider was renamed llm -> custom
    return "custom" if name == "llm" else name


def translate_text(text: str, config: dict) -> str:
    name = _provider_name(config)
    if name not in _PROVIDERS:
        raise TranslateError(f"Unknown translation provider: {name!r}")
    return _provider_fn(name)(text, config.get("targetLang") or "en", config)


def translate_texts(texts: list[str], config: dict) -> list[str]:
    """Translate a list of texts — native batch if the provider supports it,
    otherwise per-text loop."""
    name = _provider_name(config)
    if name not in _PROVIDERS:
        raise TranslateError(f"Unknown translation provider: {name!r}")
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

    batch_fn = _batch_fn(name)
    if batch_fn is not None:
        translated = batch_fn(payload, target, config)
    else:
        fn = _provider_fn(name)
        translated = []
        for (i, t) in non_empty:
            seg_config = config
            if prev_lines:
                # Single-call mode: the provider reads previousLines[0]
                seg_config = {**config, "previousLines": [prev_lines[i]]}
            if types:
                seg_config = {**seg_config, "types": [types[i]]}
            translated.append(fn(t, target, seg_config))

    results = [""] * len(texts)
    for (i, _), tr in zip(non_empty, translated):
        results[i] = tr
    return results


__all__ = [
    "TranslateError",
    "translate_text",
    "translate_texts",
]
