"""Detection services — pluggable model registry (mirrors ``services/ocr``).

Add a new model: create ``<name>.py`` exposing a ``BaseDetectModel``
subclass, then register it in ``MODELS``. The API surface below
(``detect`` / ``is_model_ready`` / ``download_model``) is what
``main.py`` and the renderer talk to.
"""
from __future__ import annotations

from typing import Optional

from .base import BaseDetectModel, ProgressCallback
from .rtdetr import RTDetrModel
from .rfdetr_seg import RfDetrSegModel

MODELS: dict[str, BaseDetectModel] = {
    "rtdetr": RTDetrModel(),
    "rfdetr_seg": RfDetrSegModel(),
}
DEFAULT_MODEL = "rfdetr_seg"

# Module-level progress callback — legacy main.py pattern sets this before
# calling download_model(); model classes accept a per-call callback too.
progress_callback: ProgressCallback = None


def get_models() -> dict[str, BaseDetectModel]:
    return dict(MODELS)


def get_models_info() -> list[dict]:
    """Registry metadata for the settings → Models manager."""
    return [
        {
            "id": name,
            "name": m.name,
            "kind": "detect",
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
            print(f"[Lumina] Downloading detect model: {name}")
            m.download(cb)


def detect(image_path: str, model: str = DEFAULT_MODEL) -> dict:
    """Run text/bubble detection on an image page."""
    if model not in MODELS:
        raise ValueError(f"Unknown detect model: {model}")
    return MODELS[model].detect(image_path)
