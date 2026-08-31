"""Shared ONNX inpaint engine (LaMa-family).

crop each box with context padding -> build a text mask -> letterbox to a
square input (aspect-preserving) -> run the graph -> scale output -> resize
back -> one RGBA patch per box (RGB = pixels, A = feathered mask).

DirectML limitation: LaMa's FFC blocks crash at runtime under
DmlExecutionProvider (microsoft/onnxruntime#24744, 80070057 E_INVALIDARG
inside the DML kernel). `_load_session` in base.py therefore prefers CPU
unless CUDA EP is available.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np

from utils.logger import log
from .base import BaseInpaintModel, _cache_dir


class OnnxInpaintModel(BaseInpaintModel):
    """LaMa-style ONNX inpainter. Subclasses only override config knobs."""

    mask_binary: bool = True  # threshold mask to 0/1 before feeding
    output_scale: float = 1.0  # graph output range multiplier
    input_size: int = 512
    context_pad: int = 32
    mask_dilate: int = 4

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

        # Optional model-produced full-page text mask; cropped per box it
        # replaces the heuristic Otsu mask (which fails on colorful pages).
        # Falls back to Otsu when missing or empty.
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
            output_dir = _cache_dir() / f"{src.stem}_inpaint_{stamp}"
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

            # Detected text box relative to the crop — constrains the mask
            # to the text region so context-margin art is never erased.
            box_rect = (
                int(box["x"]) - x0,
                int(box["y"]) - y0,
                int(box["x"]) + int(box["w"]) - x0,
                int(box["y"]) + int(box["h"]) - y0,
            )
            if page_mask is not None:
                mask = page_mask[y0:y1, x0:x1].copy()
                # Model missed this box (no mask pixels) -> heuristic fallback
                if cv.countNonZero(mask) < max(1, mask.size // 100):
                    log.debug(f"Empty model mask for box {i}, using heuristic mask")
                    mask = self._build_mask(crop, box_rect)
            else:
                mask = self._build_mask(crop, box_rect)

            # Letterbox to a square input (aspect-preserving; direct resize
            # to 512x512 squished wide/short crops and made LaMa hallucinate
            # distorted art). Image pads with replicated edges, mask with 0.
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

            # Feathered mask -> alpha channel (same blur as the compositor)
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

        Otsu is computed inside the box ONLY (box_rect = detected text box
        relative to the crop), so context-margin art is never erased. Handles
        dark glyphs on light panels and light glyphs on dark panels.
        """
        import cv2 as cv

        gray = cv.cvtColor(crop, cv.COLOR_BGR2GRAY)
        bx0, by0, bx1, by1 = box_rect
        box_gray = gray[by0:by1, bx0:bx1]

        mask = np.zeros(gray.shape, np.uint8)

        # Flat region (no text) -> nothing to inpaint.
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

        # Near-empty result (mid-gray text, colorful art) -> full box.
        if cv.countNonZero(mask) < box_gray.size * 0.01:
            mask[by0:by1, bx0:bx1] = 255

        kernel = cv.getStructuringElement(
            cv.MORPH_ELLIPSE, (self.mask_dilate * 2 + 1,) * 2
        )
        return cv.dilate(mask, kernel)
