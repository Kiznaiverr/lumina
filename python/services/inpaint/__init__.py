"""Inpaint services — pluggable model registry (mirrors ``services/translate``).

Add a new model: create ``<name>.py`` exposing a ``BaseInpaintModel``
subclass, then register it in ``MODELS``. The API surface below
(``inpaint_boxes`` / ``is_model_ready`` / ``download_model``) is what
``main.py`` and the renderer talk to.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from .base import BaseInpaintModel, ProgressCallback
from .lama import LamaModel
from .lama_manga import LamaMangaModel

MODELS: dict[str, BaseInpaintModel] = {
    "lama": LamaModel(),
    "lama_manga": LamaMangaModel(),
}
DEFAULT_MODEL = "lama_manga"

# Module-level progress callback — legacy main.py pattern sets this before
# calling download_model(); model classes accept a per-call callback too.
progress_callback: ProgressCallback = None


def get_models() -> dict[str, BaseInpaintModel]:
    return dict(MODELS)


def get_models_info() -> list[dict]:
    """Registry metadata for the settings → Models manager."""
    return [
        {
            "id": name,
            "name": m.name,
            "kind": "inpaint",
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
            print(f"[Lumina] Downloading inpaint model: {name}")
            m.download(cb)


def inpaint_boxes(
    image_path: str,
    boxes: list[dict],
    output_dir: Optional[Path] = None,
    model: str = DEFAULT_MODEL,
    mask_path: Optional[str] = None,
) -> list[dict]:
    """Inpaint every box and return per-patch RGBA PNG records.

    ``mask_path`` is an optional full-page binary text mask (from the
    segmentation detect model); when provided the per-box mask is cropped
    from it instead of the heuristic Otsu mask.
    """
    if model not in MODELS:
        raise ValueError(f"Unknown inpaint model: {model}")
    return MODELS[model].inpaint(image_path, boxes, output_dir, mask_path)


def unload_models() -> None:
    """Release every loaded inpaint session (frees VRAM/RAM)."""
    for m in MODELS.values():
        try:
            m.unload()
        except Exception:
            pass
