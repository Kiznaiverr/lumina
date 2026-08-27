"""Shared base for ONNX inpainting models (image + mask → patch PNGs).

Implements the generic ONNX pipeline shared by every LaMa-family export:

  crop each box with context padding → build a text mask → resize both to
  ``input_size`` → run the graph (image + mask inputs) → scale the output →
  resize back → write one RGBA patch per box (RGB = inpainted pixels,
  A = feathered mask).

Subclasses only override:
  - metadata: ``model_id`` / ``model_filename`` (+ ``name`` / ``description``)
  - preprocessing knobs: ``mask_binary``, ``output_scale``, ``input_size``,
    ``context_pad``, ``mask_dilate``
  - the mask strategy: ``_build_mask(crop)`` → 0..255 mask

A non-LaMa model that follows the same image+mask ONNX contract can also
subclass this; anything architecturally different should subclass
:class:`BaseInpaintModel` directly.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np

from utils.logger import log
from .base import BaseInpaintModel, ProgressCallback

# Model + patch directories live in <repo>/models and <repo>/cache
# (override with LUMINA_MODEL_DIR / LUMINA_CACHE_DIR env vars).
_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[4] / "models")
)
_CACHE_DIR = Path(
    os.environ.get("LUMINA_CACHE_DIR", Path(__file__).resolve().parents[4] / "cache")
)


class OnnxInpaintModel(BaseInpaintModel):
    """LaMa-style ONNX inpainter: image + mask in, inpainted patch out."""

    model_id: str = ""
    model_filename: str = ""
    mask_binary: bool = True  # threshold mask to 0/1 before feeding
    output_scale: float = 1.0  # graph output range multiplier
    input_size: int = 512
    context_pad: int = 32
    mask_dilate: int = 4

    def __init__(self) -> None:
        self._session = None
        self._path = _MODELS_DIR / self.model_filename

    @property
    def model_url(self) -> str:
        return (
            f"https://huggingface.co/{self.model_id}/resolve/main/"
            f"{self.model_filename}"
        )

    def is_ready(self) -> bool:
        return self._path.is_file()

    def size(self) -> Optional[int]:
        return self._path.stat().st_size if self.is_ready() else None

    def download(self, progress_callback: ProgressCallback = None) -> None:
        import urllib.request

        if self.is_ready():
            log.info(f"Inpaint model already present: {self._path}")
            return

        _MODELS_DIR.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(".onnx.part")

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

        tmp_path.rename(self._path)
        log.info(f"Inpaint model download complete: {self._path}")

    def _load_session(self):
        if self._session is None:
            import onnxruntime as ort

            if not self.is_ready():
                self.download()

            log.info(f"Loading inpaint ONNX model: {self._path}")
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self._session = ort.InferenceSession(
                str(self._path), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            log.info(
                f"Inpaint session ready (inputs: "
                f"{[(i.name, i.shape) for i in self._session.get_inputs()]})"
            )
        return self._session

    def inpaint(
        self,
        image_path: str,
        boxes: list[dict],
        output_dir: Optional[Path] = None,
    ) -> list[dict]:
        import cv2 as cv

        session = self._load_session()
        img = cv.imread(image_path)  # BGR
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        h, w = img.shape[:2]

        if output_dir is None:
            src = Path(image_path)
            import time

            stamp = time.strftime("%Y%m%d-%H%M%S")
            output_dir = _CACHE_DIR / f"{src.stem}_inpaint_{stamp}"
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        patches: list[dict] = []
        for i, box in enumerate(boxes):
            x0 = max(0, int(box["x"]) - self.context_pad)
            y0 = max(0, int(box["y"]) - self.context_pad)
            x1 = min(w, int(box["x"] + box["w"]) + self.context_pad)
            y1 = min(h, int(box["y"] + box["h"]) + self.context_pad)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue

            crop = img[y0:y1, x0:x1]
            ch, cw = crop.shape[:2]

            mask = self._build_mask(crop)

            image_blob = cv.dnn.blobFromImage(
                crop,
                1.0 / 255.0,
                (self.input_size, self.input_size),
                (0, 0, 0),
                swapRB=False,
            )
            mask_blob = cv.dnn.blobFromImage(
                mask, 1.0, (self.input_size, self.input_size), (0,), crop=False
            )
            if self.mask_binary:
                mask_blob = (mask_blob > 0).astype(np.float32)
            else:
                mask_blob = mask_blob / 255.0

            feed: dict = {}
            ins = session.get_inputs()
            mask_inputs = [i for i in ins if "mask" in i.name.lower()]
            if len(mask_inputs) == 1:
                for inp in ins:
                    feed[inp.name] = mask_blob if inp is mask_inputs[0] else image_blob
            else:
                # Fallback: export without a "mask"-named input — feed by order.
                feed[ins[0].name] = image_blob
                if len(ins) > 1:
                    feed[ins[1].name] = mask_blob

            output = np.asarray(session.run(None, feed)[0])[0]  # CHW
            output = output * self.output_scale

            result = np.transpose(output, (1, 2, 0))
            result = np.clip(result, 0, 255).astype(np.uint8)
            result = cv.resize(result, (cw, ch), interpolation=cv.INTER_LINEAR)

            # Feathered mask → alpha channel (same blur as the old compositor)
            alpha = cv.GaussianBlur(mask, (0, 0), 2).astype(np.float32)
            alpha = np.clip(alpha, 0, 255).astype(np.uint8)

            patch = np.dstack([result, alpha])
            patch_path = output_dir / f"patch_{i:03d}.png"
            cv.imwrite(str(patch_path), patch)

            patches.append(
                {
                    "bbox": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
                    "imagePath": str(patch_path),
                }
            )

        log.info(f"Inpaint complete: {len(patches)} patch(es) -> {output_dir}")
        return patches

    def _build_mask(self, crop: np.ndarray) -> np.ndarray:
        """Turn an RGB crop into a 0..255 mask covering the text region."""
        raise NotImplementedError
