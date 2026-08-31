"""Base contract for inpainting models.

Every model module in this package exposes a class subclassing
:class:`BaseInpaintModel` and is registered in ``MODELS`` (see
``__init__.py``). Adding a new model = drop in a new file + one registry
entry; the API, download pipeline, and Electron frontend need no changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, Optional

ProgressCallback = Optional[Callable[[int, int, int], None]]


class BaseInpaintModel(ABC):
    """Interface for a Lumina inpaint model.

    Models return one *patch* per input box:

        {"bbox": {"x","y","w","h"}, "imagePath": "<abs path to RGBA PNG>"}

    The PNG's RGB channels are the inpainted pixels; its alpha channel is a
    feathered mask. Compositing the patch over the original image at the
    given bbox reproduces the inpainted result, while keeping every region
    independently toggleable/editable in the editor.
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
        The model is lazily re-loaded on the next ``inpaint()`` call."""

    @abstractmethod
    def inpaint(
        self,
        image_path: str,
        boxes: list[dict],
        output_dir: Optional[Path] = None,
    ) -> list[dict]:
        """Inpaint each box; write one RGBA patch PNG per box."""
