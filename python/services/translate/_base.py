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
    """Render the system instruction; previous_line falls back to config.

    Config may carry ``previousLines`` (per-text list, aligned by index) — the
    first entry is used when the caller did not pass an explicit line.
    """
    if previous_line is None:
        prev = config.get("previousLines") or config.get("previousLine") or ""
        if isinstance(prev, list):
            previous_line = prev[0] if prev else ""
        else:
            previous_line = str(prev)
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


# Segment type hints from the detector (FE passes them through); mapped to a
# human-readable register label for the model.
_SEGMENT_TYPE_LABELS = {
    "text_bubble": "dialogue (speech bubble)",
    "bubble": "dialogue (speech bubble)",
    "text_free": "narration/caption",
}


def build_batch_prompt(
    texts: list[str],
    target: str,
    previous_lines: list[str] | None = None,
    types: list[str] | None = None,
) -> str:
    """User prompt for one numbered-list chat completion over many texts.

    Line breaks inside a segment are escaped as ⏎ so multiline bubble text
    (vertical text, stacked lines) cannot corrupt the numbered-list format.

    ``previous_lines`` (optional, aligned with ``texts`` by index) is the
    already-translated preceding dialogue, oldest first, giving the model the
    FULL page context so it can complete truncated OCR text and keep names
    consistent — not just the immediately previous line.

    ``types`` (optional, aligned with ``texts`` by index) is the detector's
    segment type (text_bubble/text_free/...), so the model can match register.
    """
    escaped = [
        t.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "⏎")
        for t in texts
    ]
    ctx = previous_lines or [""] * len(texts)
    ty = types or [""] * len(texts)
    lines: list[str] = []
    for i, (t, c, k) in enumerate(zip(escaped, ctx, ty)):
        lines.append(f"[{i}] {t}")
        label = _SEGMENT_TYPE_LABELS.get(k, k)
        if label:
            lines.append(f"    type: {label}")
        if c:
            lines.append(f"    context: {c}")
    numbered = "\n".join(lines)
    return (
        f"Target language: {target}\n\n"
        "This is a manga page. The input is a numbered list of text segments "
        "(OCR output) in reading order; the OCR text may be truncated or "
        "imperfect. Each segment may be followed by indented 'type:' "
        "(dialogue / narration / SFX) and 'context:' (preceding dialogue, "
        "already translated, oldest first) lines.\n"
        "Translate EVERY segment. Use the context to:\n"
        "- complete truncated lines: if a segment is cut off mid-phrase, "
        "translate the complete intended line;\n"
        "- keep character names, honorifics, and terms consistent;\n"
        "- resolve ambiguous fragments;\n"
        "- match the register: dialogue is casual and natural, narration is "
        "more formal.\n"
        "- if a segment is already fully in the target language, return it "
        "unchanged.\n"
        "Keep ⏎ line breaks in your translation.\n"
        "Output ONLY a numbered list in the same format with the same indices, "
        "one line per segment — never skip, merge, or reorder indices. Type and "
        "context lines are input only; do not repeat them in your output. If "
        "you cannot translate a segment, repeat its source text.\n"
        "[0] translation of segment 0\n"
        "[1] translation of segment 1\n\n"
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
        val = m.group(2).strip().replace("⏎", "\n")
        if 0 <= idx < count and not seen[idx]:
            results[idx] = val
            seen[idx] = True

    missing = [i for i, ok in enumerate(seen) if not ok]
    if missing:
        log.warn(
            f"{label} batch response missing translations for indices: "
            f"{missing} — filling with empty strings"
        )
    return results
