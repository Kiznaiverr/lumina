"""Base contract for text/bubble detection models.

Every model module in this package exposes a class subclassing
:class:`BaseDetectModel` and is registered in ``MODELS`` (see
``__init__.py``). Adding a new model = drop in a new file + one registry
entry; the API, download pipeline, and Electron frontend need no changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable, Optional

ProgressCallback = Optional[Callable[[int, int, int], None]]


class BaseDetectModel(ABC):
    """Interface for a Lumina detection model.

    Models receive a page image path and return detection lists:

        {
            "textDetections": [{"bbox": {x,y,w,h}, "type": str, "confidence": float}, ...],
            "bubbleDetections": [{"bbox": {x,y,w,h}, "confidence": float}, ...],
        }
    """

    name: str = ""

    @abstractmethod
    def is_ready(self) -> bool:
        """True if the model weights are present on disk."""

    @abstractmethod
    def download(self, progress_callback: ProgressCallback = None) -> None:
        """Fetch missing model weights. Blocks until done."""

    def size(self) -> Optional[int]:
        """Total bytes of installed weight files; None if not installed."""
        return None

    @abstractmethod
    def detect(self, image_path: str) -> dict:
        """Detect text boxes and speech bubbles on an image page."""
