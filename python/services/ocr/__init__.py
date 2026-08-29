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


def ocr_boxes(
    image_path: str,
    boxes: list[dict],
    model: str = DEFAULT_MODEL,
) -> list[str]:
    """Recognize text in every box; returns one string per box."""
    if model not in MODELS:
        raise ValueError(f"Unknown OCR model: {model}")
    return MODELS[model].ocr_boxes(image_path, boxes)
