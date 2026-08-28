"""Base contract for OCR models.

Every model module in this package exposes a class subclassing
:class:`BaseOcrModel` and is registered in ``MODELS`` (see
``__init__.py``). Adding a new model = drop in a new file + one registry
entry; the API, download pipeline, and Electron frontend need no changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable, Optional

ProgressCallback = Optional[Callable[[int, int, int], None]]


class BaseOcrModel(ABC):
    """Interface for a Lumina OCR model.

    Models receive the page image path plus one bbox per detected text box
    and return one recognized string per box, positionally aligned:

        ["こんにちは", "ありがとう", ...]
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
    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        """Recognize text in each box; returns one string per box."""
