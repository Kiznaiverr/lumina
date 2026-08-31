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

    def unload(self) -> None:
        """Release loaded sessions (VRAM/RAM). No-op when nothing is loaded.
        The model is lazily re-loaded on the next ``ocr_boxes()`` call."""

    @abstractmethod
    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        """Recognize text in each box; returns one string per box."""

    def supports_regions(self) -> bool:
        """True when this model recognizes several boxes in one crop.

        Vision-language models (e.g. PaddleOCR-VL) read a region crop made
        of adjacent boxes at once; crop-trained models (manga-ocr, Baberu,
        PP-OCRv6) recognize one tight line crop each and must stay
        per-box. The ``ocr_boxes`` dispatcher uses region mode only for
        models that opt in here.
        """
        return False

    def ocr_regions(self, image_path: str, regions: list[dict]) -> list[list[str]]:
        """Region-based recognition.

        ``regions`` items: ``{"boxes": [...], "x", "y", "w", "h"}`` where
        ``boxes`` are in reading order and the bbox covers them all.
        Returns one list of strings per region, aligned positionally to
        that region's ``boxes`` — the caller flattens them back into one
        string per box.

        Default implementation falls back to per-box recognition; models
        with :meth:`supports_regions` override this and must guarantee the
        alignment (e.g. by falling back to ``ocr_boxes`` per region when
        the model's line count doesn't match the box count).
        """
        return [self.ocr_boxes(image_path, r["boxes"]) for r in regions]
