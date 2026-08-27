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

MODELS: dict[str, BaseInpaintModel] = {
    "lama": LamaModel(),
}
DEFAULT_MODEL = "lama"

# Module-level progress callback — legacy main.py pattern sets this before
# calling download_model(); model classes accept a per-call callback too.
progress_callback: ProgressCallback = None


def get_models() -> dict[str, BaseInpaintModel]:
    return dict(MODELS)


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
) -> list[dict]:
    """Inpaint every box and return per-patch RGBA PNG records."""
    if model not in MODELS:
        raise ValueError(f"Unknown inpaint model: {model}")
    return MODELS[model].inpaint(image_path, boxes, output_dir)
