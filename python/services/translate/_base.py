"""Shared transport, errors and prompt helpers for translation providers."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path

from utils.logger import log


class TranslateError(Exception):
    pass


def _sanitize_url(url: str) -> str:
    """Strip query string (e.g. Gemini API key) before logging."""
    return url.split("?", 1)[0]


def _describe_http_error(err: urllib.error.HTTPError) -> str:
    """"HTTP <code> <reason>: <response body>" — the body holds the real cause."""
    detail = f"HTTP {err.code} {err.reason}"
    try:
        body = err.read().decode("utf-8", "replace").strip()
        if body:
            detail += f": {body[:500]}"
    except Exception:
        pass
    return detail


def http_post_json(url: str, payload: dict, headers: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log.warn(f"POST {_sanitize_url(url)} -> {_describe_http_error(e)}")
        raise TranslateError(_describe_http_error(e)) from e
    except Exception as e:
        log.warn(f"POST {_sanitize_url(url)} failed: {e}")
        raise


def http_get_json(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


# Default instruction lives in prompts/translate-default.md.
# {target} placeholder is replaced with the target language at request time.
_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"


def load_default_instruction() -> str:
    try:
        return (_PROMPTS_DIR / "translate-default.md").read_text(encoding="utf-8")
    except OSError:
        return "Translate the given text into {target}. Output ONLY the translation."


def _render_template(template: str, values: dict) -> str:
    """Replace {{key}} placeholders; missing keys become empty strings."""
    out = template
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", str(value or ""))
    # Strip any leftover unknown placeholders
    return re.sub(r"\{\{\w+\}\}", "", out)


def build_system_instruction(
    config: dict, target: str, source: str, previous_line: str | None = None
) -> str:
    """Render the system instruction; previous_line falls back to config."""
    if previous_line is None:
        previous_line = config.get("previousLine") or ""
    return _render_template(
        config.get("llmInstruction") or load_default_instruction(),
        {
            "target_language": target,
            "source_language": source,
            "previous_line": previous_line,
        },
    )


def build_single_prompt(text: str, target: str) -> str:
    return f"Target language: {target}\n\nText:\n{text}"


def build_batch_prompt(texts: list[str], target: str) -> str:
    """User prompt for one numbered-list chat completion over many texts."""
    numbered = "\n".join(f"[{i}] {t}" for i, t in enumerate(texts))
    return (
        f"Target language: {target}\n\n"
        "The input is a numbered list of independent text segments "
        "(speech bubbles on one manga page). Translate EACH line independently.\n"
        "Output ONLY a numbered list in the same format with the same indices:\n"
        "[0] translation of line 0\n"
        "[1] translation of line 1\n\n"
        f"{numbered}"
    )


def parse_numbered_batch(raw: str, count: int, label: str = "LLM") -> list[str]:
    """Parse "[i] text" lines back into a result array of size `count`."""
    results: list[str] = [""] * count
    seen = [False] * count
    pattern = re.compile(r"^\s*[\[\(]?(\d+)[\]\)]?\s*[.:\-]?\s*(.*)$")
    for line in raw.splitlines():
        m = pattern.match(line)
        if not m:
            continue
        idx = int(m.group(1))
        val = m.group(2).strip()
        if 0 <= idx < count and not seen[idx]:
            results[idx] = val
            seen[idx] = True

    missing = [i for i, ok in enumerate(seen) if not ok]
    if missing:
        raise TranslateError(
            f"{label} batch response missing translations for indices: {missing}"
        )
    return results
