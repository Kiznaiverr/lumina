"""Detection services — pluggable model registry.

New model = new package under this folder (named after its registry id)
+ one entry in ``MODELS``; main.py and the renderer need no changes.
"""
from __future__ import annotations

from typing import Optional

from .base import BaseDetectModel, ProgressCallback
from .rtdetr.model import RTDetrModel
from .rfdetr_seg.model import RfDetrSegModel

MODELS: dict[str, BaseDetectModel] = {
    "rtdetr": RTDetrModel(),
    "rfdetr_seg": RfDetrSegModel(),
}
DEFAULT_MODEL = "rtdetr"

# Legacy: main.py can set this before download_model(); per-call callback wins.
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
            "prefer": getattr(m, "prefer", None),
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


def unload_models() -> None:
    """Release every loaded detect session (frees VRAM/RAM)."""
    for m in MODELS.values():
        try:
            m.unload()
        except Exception:
            pass
