"""OCR model contract + shared lifecycle.

Subclasses only set name/model_id/model_dir_name/required_files/
download_files; download (multi-file), ready/size checks, and unload
are inherited.
"""
from __future__ import annotations

import os
import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, Optional

from utils.download import DownloadCancelled, is_cancelled
from utils.logger import log

ProgressCallback = Optional[Callable[[int, int, int], None]]


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


class BaseOcrModel(ABC):
    """OCR model; ocr_boxes() returns one string per box, positionally aligned."""

    name: str = ""
    status: str = "ready"  # "ready" | "dev" — dev = in development, still usable
    model_id: str = ""
    model_dir_name: str = ""
    required_files: list[str] = []
    download_files: list[str] = []

    @property
    def model_dir(self) -> Path:
        return _models_dir() / self.model_dir_name

    def is_ready(self) -> bool:
        return all((self.model_dir / f).is_file() for f in self.required_files)

    def size(self) -> Optional[int]:
        if not self.is_ready():
            return None
        return sum(
            (self.model_dir / f).stat().st_size
            for f in self.required_files
            if (self.model_dir / f).is_file()
        )

    def download(self, progress_callback: ProgressCallback = None) -> None:
        """Fetch missing files; progress = cumulative bytes over pending files."""
        self.model_dir.mkdir(parents=True, exist_ok=True)
        base_url = f"https://huggingface.co/{self.model_id}/resolve/main/"

        log.info(f"Downloading OCR model {self.model_id} ...")
        pending = [f for f in self.download_files if not (self.model_dir / f).is_file()]

        # Grand total = sum of HEAD Content-Length, so progress never
        # overshoots 100% on multi-file models. ?download=true resolves xet blobs.
        grand_total = 0
        sizes: dict[str, int] = {}
        for f in pending:
            if is_cancelled():
                raise DownloadCancelled()
            try:
                req = urllib.request.Request(
                    base_url + f + "?download=true",
                    method="HEAD",
                    headers={"User-Agent": "Lumina/0.1"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    sizes[f] = int(resp.headers.get("Content-Length", -1))
            except Exception:
                sizes[f] = -1
            if sizes[f] > 0:
                grand_total += sizes[f]

        done = 0
        for f in pending:
            if is_cancelled():
                raise DownloadCancelled()
            dest = self.model_dir / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            part = dest.with_suffix(dest.suffix + ".part")
            req = urllib.request.Request(
                base_url + f + "?download=true", headers={"User-Agent": "Lumina/0.1"}
            )
            try:
                with urllib.request.urlopen(req) as resp, open(part, "wb") as out:
                    total = int(resp.headers.get("Content-Length", -1))
                    if total > 0 and sizes.get(f, -1) <= 0:
                        grand_total += total  # size discovered late
                    while True:
                        if is_cancelled():
                            raise DownloadCancelled()
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
                        done += len(chunk)
                        if progress_callback and grand_total > 0:
                            progress_callback(int(done * 100 / grand_total), done, grand_total)
            except DownloadCancelled:
                part.unlink(missing_ok=True)
                log.info(f"OCR model download cancelled — removed {part.name}")
                raise
            except Exception:
                part.unlink(missing_ok=True)
                raise
            part.rename(dest)
        log.info(f"OCR model download complete: {self.model_id}")

    def unload(self) -> None:
        """Release loaded sessions (VRAM/RAM). Reloads on next ocr_boxes()."""

    @abstractmethod
    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        """Recognize text in each box; returns one string per box."""

    def supports_regions(self) -> bool:
        """True when this model recognizes several boxes in one crop (VLM)."""
        return False

    def ocr_regions(self, image_path: str, regions: list[dict]) -> list[list[str]]:
        """Region-based recognition; default = per-box fallback.

        ``regions`` items: {"boxes": [...], "x", "y", "w", "h"} — boxes in
        reading order, bbox covering them all. Returns one list of strings
        per region aligned to that region's boxes.
        """
        return [self.ocr_boxes(image_path, r["boxes"]) for r in regions]
