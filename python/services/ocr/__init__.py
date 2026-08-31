"""OCR services — pluggable model registry (mirrors ``services/inpaint``).

Add a new model: create ``<name>.py`` exposing a ``BaseOcrModel``
subclass, then register it in ``MODELS``. The API surface below
(``ocr_boxes`` / ``is_model_ready`` / ``download_model``) is what
``main.py`` and the renderer talk to.
"""
from __future__ import annotations

from typing import Optional

from .base import BaseOcrModel, ProgressCallback
from .baberu import BaberuOcrModel
from .manga_ocr import MangaOcrModel
from .ppocrv6 import PPOcrV6Model

MODELS: dict[str, BaseOcrModel] = {
    "manga_ocr": MangaOcrModel(),
    "ppocrv6": PPOcrV6Model(),
    "baberu": BaberuOcrModel(),
}
DEFAULT_MODEL = "manga_ocr"

# Module-level progress callback — legacy main.py pattern sets this before
# calling download_model(); model classes accept a per-call callback too.
progress_callback: ProgressCallback = None


def get_models() -> dict[str, BaseOcrModel]:
    return dict(MODELS)


def get_models_info() -> list[dict]:
    """Registry metadata for the settings → Models manager."""
    return [
        {
            "id": name,
            "name": m.name,
            "kind": "ocr",
            "ready": m.is_ready(),
            "size": m.size(),
        }
        for name, m in MODELS.items()
    ]


def is_model_ready(model: Optional[str] = None) -> bool:
    names = [model] if model else list(MODELS)
    return all(MODELS[n].is_ready() for n in names)


def download_model(callback: ProgressCallback = None) -> None:
    cb = callback or progress_callback
    for name, m in MODELS.items():
        if not m.is_ready():
            print(f"[Lumina] Downloading OCR model: {name}")
            m.download(cb)


# Fixed expansion (px) applied to every detection box before OCR.
# Detection boxes often clip glyph edges (italic tails, descenders, tight
# line spacing) which degrades recognition. Each model already clamps the
# crop to the image bounds, so expanding here is safe for all models.
# Users can still fine-tune the boxes themselves in the app.
OCR_BOX_PAD = 16


def _expand_boxes(boxes: list[dict]) -> list[dict]:
    """Expand every box by ``OCR_BOX_PAD`` on each side, gated per side.

    Each side grows independently up to the pad limit; a side stops
    growing as soon as it would touch/overlap another detection box
    (the expanded edge butts against the neighbor), while the other
    sides keep their full pad. This keeps OCR crops generous without
    swallowing adjacent text boxes on dense pages.
    """
    p = OCR_BOX_PAD
    out: list[dict] = []
    for i, b in enumerate(boxes):
        x, y, w, h = (int(b["x"]), int(b["y"]), int(b["w"]), int(b["h"]))
        pl = pr = pt = pb = p

        for j, c in enumerate(boxes):
            if j == i:
                continue
            cx, cy, cw, ch = (
                int(c["x"]),
                int(c["y"]),
                int(c["w"]),
                int(c["h"]),
            )
            # y-ranges overlap → neighbor sits beside; gate left/right only
            if y < cy + ch and y + h > cy:
                if cx + cw <= x:  # neighbor entirely to the left
                    pl = min(pl, x - (cx + cw))
                elif cx >= x + w:  # neighbor entirely to the right
                    pr = min(pr, cx - (x + w))
            # x-ranges overlap → neighbor sits above/below; gate top/bottom only
            if x < cx + cw and x + w > cx:
                if cy + ch <= y:  # neighbor entirely above
                    pt = min(pt, y - (cy + ch))
                elif cy >= y + h:  # neighbor entirely below
                    pb = min(pb, cy - (y + h))

        out.append(
            {
                "x": x - pl,
                "y": y - pt,
                "w": w + pl + pr,
                "h": h + pt + pb,
            }
        )
    return out


def ocr_boxes(
    image_path: str,
    boxes: list[dict],
    model: str = DEFAULT_MODEL,
) -> list[str]:
    """Recognize text in every box; returns one string per box."""
    if model not in MODELS:
        raise ValueError(f"Unknown OCR model: {model}")
    return MODELS[model].ocr_boxes(image_path, _expand_boxes(boxes))


def unload_models() -> None:
    """Release every loaded OCR session (frees VRAM/RAM)."""
    for m in MODELS.values():
        try:
            m.unload()
        except Exception:
            pass
