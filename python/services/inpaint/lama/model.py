"""Big-LaMa inpainting via ONNX Runtime (CPU only).

One RGBA patch PNG per box (RGB = pixels, A = feathered mask). Crops each
box with context padding, builds a text mask, letterboxes to a square
input (aspect-preserving), runs the graph, scales the output, and resizes
back.

CPU only: LaMa's FFC blocks crash under DirectML (microsoft/onnxruntime#
24744, 80070057 E_INVALIDARG in the DML kernel) and this quantized graph
also fails on CUDA EP (DequantizeLinear "Unsupported quantization type").
The GPU toggle is therefore ignored — PREFER = "cpu" in config keeps it on
CPU regardless of LUMINA_EP.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

import cv2 as cv
import numpy as np

from utils.logger import log

from ..base import BaseInpaintModel, _cache_dir
from .config import CONTEXT_PAD, MODEL_FILENAME, MODEL_ID, PREFER
from . import postprocess as pp
from . import preprocess as prep


class LamaModel(BaseInpaintModel):
    """LaMa-style inpainter; one RGBA patch PNG per box."""

    name = "LaMa"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME
    prefer = PREFER

    def inpaint(
        self,
        image_path: str,
        boxes: list[dict],
        output_dir: Optional[Path] = None,
        mask_path: Optional[str] = None,
    ) -> list[dict]:
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
                        loaded = cv.resize(
                            loaded, (w, h), interpolation=cv.INTER_NEAREST
                        )
                    page_mask = loaded
                else:
                    log.warn(
                        f"mask_path unreadable, falling back to heuristic mask: {mask_path}"
                    )
            else:
                log.warn(
                    f"mask_path not found, falling back to heuristic mask: {mask_path}"
                )

        if output_dir is None:
            src = Path(image_path)
            stamp = time.strftime("%Y%m%d-%H%M%S")
            output_dir = _cache_dir() / f"{src.stem}_inpaint_{stamp}"
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        patches: list[dict] = []
        for i, box in enumerate(boxes):
            x0 = max(0, int(box["x"]) - CONTEXT_PAD)
            y0 = max(0, int(box["y"]) - CONTEXT_PAD)
            x1 = min(w, int(box["x"] + box["w"]) + CONTEXT_PAD)
            y1 = min(h, int(box["y"] + box["h"]) + CONTEXT_PAD)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue

            crop = img[y0:y1, x0:x1]

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
                    log.debug(
                        f"Empty model mask for box {i}, using heuristic mask"
                    )
                    mask = prep.build_mask(crop, box_rect)
            else:
                mask = prep.build_mask(crop, box_rect)

            img_sq, mask_sq, nw, nh, pad_x, pad_y = prep.letterbox(crop, mask)
            image_blob, mask_blob = prep.make_blobs(img_sq, mask_sq)

            feed: dict = {}
            ins = session.get_inputs()
            mask_inputs = [i for i in ins if "mask" in i.name.lower()]
            if len(mask_inputs) == 1:
                for inp in ins:
                    feed[inp.name] = (
                        mask_blob if inp is mask_inputs[0] else image_blob
                    )
            else:
                # Fallback: export without a "mask"-named input — feed by order.
                feed[ins[0].name] = image_blob
                if len(ins) > 1:
                    feed[ins[1].name] = mask_blob

            output = np.asarray(session.run(None, feed)[0])[0]  # CHW
            patch = pp.compose_patch(output, mask, nw, nh, pad_x, pad_y)

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
