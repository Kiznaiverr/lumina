"""Inpaint model contract + shared lifecycle.

Subclasses only set name/model_id/model_filename/prefer (from config);
download, session loading, ready/size checks, and unload are inherited.
"""
from __future__ import annotations

import os
import tempfile
import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, Optional

from utils.logger import log

ProgressCallback = Optional[Callable[[int, int, int], None]]


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


def _cache_dir() -> Path:
    """Session-scoped patch output lives in temp (never in the repo)."""
    return Path(
        os.environ.get("LUMINA_CACHE_DIR", Path(tempfile.gettempdir()) / "lumina")
    )


class BaseInpaintModel(ABC):
    """Inpaint model; one RGBA patch PNG per box (RGB = pixels, A = feather)."""

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
        if self.is_ready():
            log.info(f"Inpaint model already present: {self.model_path}")
            return

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.model_path.with_suffix(".onnx.part")

        log.info(f"Downloading inpaint model {self.model_url} ...")
        last_pct = -1
        req = urllib.request.Request(
            self.model_url, headers={"User-Agent": "Lumina/0.1"}
        )
        try:
            with urllib.request.urlopen(req) as resp, open(tmp_path, "wb") as f:
                total = int(resp.headers.get("Content-Length", -1))
                downloaded = 0
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = int(downloaded * 100 / total)
                        if pct != last_pct:
                            last_pct = pct
                            log.debug(f"Inpaint download progress: {pct}%")
                            if progress_callback:
                                try:
                                    progress_callback(pct, downloaded, total)
                                except Exception:
                                    pass
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

        tmp_path.rename(self.model_path)
        log.info(f"Inpaint model download complete: {self.model_path}")

    def unload(self) -> None:
        """Release the ONNX session (frees VRAM/RAM). Next call reloads."""
        self._session = None

    def _load_session(self):
        if self._session is None:
            from utils.runtime import create_session, make_session_options

            if not self.is_ready():
                self.download()

            log.info(f"Loading inpaint ONNX model: {self.model_path}")
            # EP preference comes from each model's config (self.prefer):
            # lama="cpu" (FFC crashes DML; quantized graph crashes CUDA),
            # lama_manga="cuda" (never DirectML).
            self._session = create_session(
                self.model_path,
                prefer=self.prefer,
                sess_options=make_session_options(),
            )
            log.info(
                f"Inpaint session ready (inputs: "
                f"{[(i.name, i.shape) for i in self._session.get_inputs()]})"
            )
        return self._session

    @abstractmethod
    def inpaint(
        self,
        image_path: str,
        boxes: list[dict],
        output_dir: Optional[Path] = None,
        mask_path: Optional[str] = None,
    ) -> list[dict]:
        """Inpaint each box; write one RGBA patch PNG per box."""
