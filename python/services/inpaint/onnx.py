"""Shared base for ONNX inpainting models (image + mask → patch PNGs).

Implements the generic ONNX pipeline shared by every LaMa-family export:

  crop each box with context padding → build a text mask → letterbox both
  to a square ``input_size`` (aspect-preserving) → run the graph → scale the
  output → resize back → write one RGBA patch per box (RGB = inpainted
  pixels, A = feathered mask).

Subclasses only override:
  - metadata: ``model_id`` / ``model_filename``
  - preprocessing knobs: ``mask_binary``, ``output_scale``, ``input_size``,
    ``context_pad``, ``mask_dilate``
  - the mask strategy: ``_build_mask(crop, box_rect)`` → 0..255 mask.
    ``box_rect`` is the detected text box relative to the crop, so a mask
    can be constrained to the text region and never erase artwork in the
    context margin.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np

from utils.logger import log
from .base import BaseInpaintModel, ProgressCallback

# Models live in <repo>/models; inpaint patch files are session-scoped
# artifacts and live in the OS temp dir (<temp>/lumina) so they never
# accumulate in the repo. Both are overridable via env vars.
_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models")
)
_CACHE_DIR = Path(
    os.environ.get("LUMINA_CACHE_DIR", Path(tempfile.gettempdir()) / "lumina")
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
        mask_path: Optional[str] = None,
    ) -> list[dict]:
        import cv2 as cv

        session = self._load_session()
        img = cv.imread(image_path)  # BGR
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        h, w = img.shape[:2]

        # Optional model-produced full-page text mask. Cropped per box, it
        # replaces the heuristic Otsu ``_build_mask`` (which fails on
        # colorful/detailed pages). Falls back to Otsu when missing or empty.
        page_mask = None
        if mask_path:
            if Path(mask_path).is_file():
                loaded = cv.imread(mask_path, cv.IMREAD_GRAYSCALE)
                if loaded is not None:
                    if loaded.shape[:2] != (h, w):
                        loaded = cv.resize(loaded, (w, h), interpolation=cv.INTER_NEAREST)
                    page_mask = loaded
                else:
                    log.warn(f"mask_path unreadable, falling back to heuristic mask: {mask_path}")
            else:
                log.warn(f"mask_path not found, falling back to heuristic mask: {mask_path}")

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

            # Detected text box relative to the crop — subclasses use this
            # to constrain the mask to the text region only.
            box_rect = (
                int(box["x"]) - x0,
                int(box["y"]) - y0,
                int(box["x"]) + int(box["w"]) - x0,
                int(box["y"]) + int(box["h"]) - y0,
            )
            if page_mask is not None:
                mask = page_mask[y0:y1, x0:x1].copy()
                # Model missed this box (no mask pixels) → heuristic fallback
                if cv.countNonZero(mask) < max(1, mask.size // 100):
                    log.debug(f"Empty model mask for box {i}, using heuristic mask")
                    mask = self._build_mask(crop, box_rect)
            else:
                mask = self._build_mask(crop, box_rect)

            # Letterbox to a square input: preserve aspect ratio, pad with
            # replicated edge pixels (mask pads with 0). The old direct
            # resize to 512x512 squished wide/short crops, which made LaMa
            # hallucinate distorted art around the text.
            s = self.input_size
            scale = s / max(cw, ch)
            nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
            pad_x = (s - nw) // 2
            pad_y = (s - nh) // 2

            resized_img = cv.resize(crop, (nw, nh), interpolation=cv.INTER_LINEAR)
            resized_mask = cv.resize(mask, (nw, nh), interpolation=cv.INTER_NEAREST)
            img_sq = cv.copyMakeBorder(
                resized_img,
                pad_y, s - nh - pad_y, pad_x, s - nw - pad_x,
                cv.BORDER_REPLICATE,
            )
            mask_sq = cv.copyMakeBorder(
                resized_mask,
                pad_y, s - nh - pad_y, pad_x, s - nw - pad_x,
                cv.BORDER_CONSTANT,
                value=0,
            )

            image_blob = cv.dnn.blobFromImage(
                img_sq, 1.0 / 255.0, (s, s), (0, 0, 0), swapRB=False
            )
            mask_blob = cv.dnn.blobFromImage(mask_sq, 1.0, (s, s), (0,), crop=False)
            if self.mask_binary:
                mask_blob = (mask_blob > 0).astype(np.float32)
            else:
                mask_blob = np.asarray(mask_blob, dtype=np.float32) / 255.0

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
            result = result[pad_y : pad_y + nh, pad_x : pad_x + nw]
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

    def _build_mask(
        self, crop: np.ndarray, box_rect: tuple[int, int, int, int]
    ) -> np.ndarray:
        """Default mask: glyph-precise, constrained inside the text box.

        ``box_rect`` = (bx0, by0, bx1, by1) of the detected text box,
        relative to the crop. Otsu is computed inside the box ONLY, so
        artwork in the context margin is never erased. Dark glyphs on light
        panels and light glyphs on dark panels are both handled.
        """
        import cv2 as cv

        gray = cv.cvtColor(crop, cv.COLOR_BGR2GRAY)
        bx0, by0, bx1, by1 = box_rect
        box_gray = gray[by0:by1, bx0:bx1]

        mask = np.zeros(gray.shape, np.uint8)

        # Flat region (no text) → nothing to inpaint.
        if box_gray.size == 0 or box_gray.std() < 2:
            return mask

        dark = cv.threshold(
            box_gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU
        )[1]
        light = cv.threshold(
            box_gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU
        )[1]

        # Dark glyphs on light panels vs white glyphs on dark panels.
        glyph = light if box_gray.mean() < 128 else dark
        mask[by0:by1, bx0:bx1] = glyph

        # Near-empty result (mid-gray text, colorful art) → full box.
        if cv.countNonZero(mask) < box_gray.size * 0.01:
            mask[by0:by1, bx0:bx1] = 255

        kernel = cv.getStructuringElement(
            cv.MORPH_ELLIPSE, (self.mask_dilate * 2 + 1,) * 2
        )
        return cv.dilate(mask, kernel)
