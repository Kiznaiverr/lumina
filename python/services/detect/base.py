"""Detect model contract + shared ONNX lifecycle.

Subclasses set ``name`` / ``model_id`` / ``model_filename`` / ``prefer``
and implement ``detect()``; download, session loading, and ready/size
checks are inherited.
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


class BaseDetectModel(ABC):
    """Detection model; ``detect()`` returns {textDetections, bubbleDetections}."""

    name: str = ""
    model_id: str = ""
    model_filename: str = ""
    prefer: Optional[str] = "auto"  # overridden per model via config PREFER

    def __init__(self) -> None:
        self._session = None

    @property
    def model_path(self) -> Path:
        return _models_dir() / self.model_filename

    @property
    def model_url(self) -> str:
        return (
            f"https://huggingface.co/{self.model_id}/resolve/main/"
            f"{self.model_filename}"
        )

    def is_ready(self) -> bool:
        return self.model_path.is_file()

    def size(self) -> Optional[int]:
        return self.model_path.stat().st_size if self.is_ready() else None

    def download(self, progress_callback: ProgressCallback = None) -> None:
        """Download missing weights; blocks until done."""
        if self.is_ready():
            log.info(f"Detect model already present: {self.model_path}")
            return

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.model_path.with_suffix(".onnx.part")

        log.info(f"Downloading detect model {self.model_url} ...")
        last_pct = -1

        def _report(pct: int, downloaded: int, total: int) -> None:
            nonlocal last_pct
            if pct != last_pct:
                last_pct = pct
                log.debug(f"Detect download progress: {pct}%")
                if progress_callback:
                    try:
                        progress_callback(pct, downloaded, total)
                    except Exception:
                        pass

        req = urllib.request.Request(
            self.model_url, headers={"User-Agent": "Lumina/0.1"}
        )
        try:
            with urllib.request.urlopen(req) as resp, open(tmp_path, "wb") as f:
                total = int(resp.headers.get("Content-Length", -1))
                downloaded = 0
                while True:
                    if is_cancelled():
                        raise DownloadCancelled()
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        _report(int(downloaded * 100 / total), downloaded, total)
        except DownloadCancelled:
            tmp_path.unlink(missing_ok=True)
            log.info(f"Detect model download cancelled — removed {tmp_path.name}")
            raise
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

        tmp_path.rename(self.model_path)
        log.info(f"Detect model download complete: {self.model_path}")

    def unload(self) -> None:
        """Release the ONNX session (frees VRAM/RAM). Reloads on next detect()."""
        self._session = None

    def _load_session(self):
        if self._session is None:
            from utils.runtime import create_session, make_session_options

            if not self.is_ready():
                self.download()

            log.info(f"Loading detect ONNX model: {self.model_path}")
            self._session = create_session(
                self.model_path,
                prefer=self.prefer,
                sess_options=make_session_options(),
            )
            log.info(
                f"Detect ONNX session ready (inputs: "
                f"{[(i.name, i.shape) for i in self._session.get_inputs()]})"
            )
        return self._session

    @abstractmethod
    def detect(self, image_path: str) -> dict:
        """Detect text boxes and speech bubbles on an image page."""
