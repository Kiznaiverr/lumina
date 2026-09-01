"""PaddleOCR-VL 1.6 — vision-language OCR (NaViT vision + ERNIE decoder).

Recognizes whole regions of text at once (multi-language), so Lumina feeds
it region crops made of several detected boxes — see supports_regions /
ocr_regions. Three ONNX graphs: vision encoder (GPU), token embedding
table (CPU), KV-cache decoder (CPU).

Known int8 caveats (model card):
  - quality degrades on long sequences -> each region is capped to a few
    boxes and oversized crops are downscaled to <= MAX_PATCHES.
  - this int8 build is FASTER on CPU than on Intel Arc iGPU -> decoder CPU.

Prompt: <|begin_of_sentence|>User: <|IMAGE_START|>{placeholders}<|IMAGE_END|>OCR:\nAssistant:\n
with one <|IMAGE_PLACEHOLDER|> per merged (2x2) image patch.

Split: preprocess.py (NaViT patchify), vision.py (vision encoder session),
decoder.py (embedding + KV-cache decode). This module only orchestrates.

Crops below min_pixels are grown with surrounding page content (native
resolution) instead of being upscaled — matches how the HF demo reads
blocks and avoids the blur that makes the int8 model hallucinate.
"""
from __future__ import annotations

import json
from typing import Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from .config import (
    DOWNLOAD_FILES,
    MODEL_DIR_NAME,
    MODEL_ID,
    PREPROCESSOR_FILE,
    REGION_PAD_PX,
    REQUIRED_FILES,
)
from .decoder import Decoder
from .preprocess import preprocess_region
from .vision import VisionEncoder


class PaddleOcrVlModel(BaseOcrModel):
    name = "PaddleOCR-VL 1.6 (ONNX)"
    status = "dev"  # in development — integration still being tuned
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES

    def __init__(self) -> None:
        self._vis: Optional[VisionEncoder] = None
        self._dec: Optional[Decoder] = None
        self._min_pixels = 112896
        self._max_pixels = 0
        self._mean = (0.5, 0.5, 0.5)
        self._std = (0.5, 0.5, 0.5)

    def unload(self) -> None:
        """Release all ONNX sessions + tokenizer (frees VRAM/RAM)."""
        self._vis = None
        self._dec = None

    def _load(self) -> None:
        if self._vis is not None:
            return
        log.info("Loading PaddleOCR-VL ONNX (this takes a moment)...")
        self._vis = VisionEncoder(self.model_dir)
        self._dec = Decoder(self.model_dir)
        cfg = json.loads(
            (self.model_dir / PREPROCESSOR_FILE).read_text(encoding="utf-8")
        )
        self._min_pixels = int(cfg.get("min_pixels", self._min_pixels))
        self._max_pixels = int(cfg.get("max_pixels") or 0)
        mean = cfg.get("image_mean") or cfg.get("mean")
        std = cfg.get("image_std") or cfg.get("std")
        if mean and len(mean) == 3:
            self._mean = tuple(float(v) for v in mean)
        if std and len(std) == 3:
            self._std = tuple(float(v) for v in std)
        log.info("PaddleOCR-VL ready")

    def supports_regions(self) -> bool:
        return True

    # ── inference ────────────────────────────────────────────────────────

    def _expand_window(
        self, img, x0: int, y0: int, x1: int, y1: int
    ) -> tuple[int, int, int, int]:
        """Grow a crop window to ~min_pixels of NATIVE page content.

        Small tight crops (a box or two) are below min_pixels; upscaling
        them blurs glyphs and makes the int8 model hallucinate. Instead we
        enlarge the window with surrounding page content so the model sees
        a native-resolution block — the same regime it was demoed in.
        """
        target = self._min_pixels * 1.5
        for _ in range(64):
            w, h = x1 - x0, y1 - y0
            if w * h >= target or (w >= img.width and h >= img.height):
                break
            if w >= img.width:
                y0 = max(0, y0 - (h // 2))
                y1 = min(img.height, y1 + (h // 2))
            elif h >= img.height:
                x0 = max(0, x0 - (w // 2))
                x1 = min(img.width, x1 + (w // 2))
            else:
                x0 = max(0, x0 - (w // 4))
                x1 = min(img.width, x1 + (w // 4))
                y0 = max(0, y0 - (h // 4))
                y1 = min(img.height, y1 + (h // 4))
        return x0, y0, x1, y1

    def _crop_for_ocr(self, img, box: dict, pad: int = REGION_PAD_PX):
        """Window for one crop: box + pad, then grown to ~min_pixels."""
        x0 = max(0, int(box["x"]) - pad)
        y0 = max(0, int(box["y"]) - pad)
        x1 = min(img.width, x0 + max(1, int(box["w"])) + pad)
        y1 = min(img.height, y0 + max(1, int(box["h"])) + pad)
        x0, y0, x1, y1 = self._expand_window(img, x0, y0, x1, y1)
        return img.crop((x0, y0, x1, y1))

    def _ocr_region(self, img, box: dict) -> str:
        """Full pipeline on one crop: vision -> prefill -> step loop."""
        vis, dec = self._vis, self._dec
        assert vis is not None and dec is not None
        crop = self._crop_for_ocr(img, box)
        pixel_values, grid = preprocess_region(
            crop,
            min_pixels=self._min_pixels,
            max_pixels=self._max_pixels,
            mean=self._mean,
            std=self._std,
        )
        return dec.decode(vis.encode(pixel_values, grid))

    # ── API ──────────────────────────────────────────────────────────────

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        """Per-box fallback path (also used when a region's line count
        doesn't match its box count)."""
        from PIL import Image

        self._load()
        img = Image.open(image_path).convert("RGB")
        texts: list[str] = []
        for i, b in enumerate(boxes):
            text = self._ocr_region(img, b)
            texts.append(text)
            log.debug(f"OCR box {i + 1}/{len(boxes)}: {text!r}")
        return texts

    def ocr_regions(self, image_path: str, regions: list[dict]) -> list[list[str]]:
        """Region mode: one VLM pass per region, output split into lines
        aligned to the region's boxes (reading order). Falls back to
        per-box recognition when the line count doesn't match."""
        from PIL import Image

        self._load()
        img = Image.open(image_path).convert("RGB")
        out: list[list[str]] = []
        for ri, region in enumerate(regions):
            boxes = region["boxes"]
            pad = 8  # a little context around the merged boxes
            x0 = max(0, int(region["x"]) - pad)
            y0 = max(0, int(region["y"]) - pad)
            x1 = min(img.width, int(region["x"] + region["w"]) + pad)
            y1 = min(img.height, int(region["y"] + region["h"]) + pad)
            crop = img.crop((x0, y0, x1, y1))
            if crop.width * crop.height < self._min_pixels:
                x0, y0, x1, y1 = self._expand_window(img, x0, y0, x1, y1)
                crop = img.crop((x0, y0, x1, y1))
            pixel_values, grid = preprocess_region(
                crop,
                min_pixels=self._min_pixels,
                max_pixels=self._max_pixels,
                mean=self._mean,
                std=self._std,
            )
            text = self._dec.decode(self._vis.encode(pixel_values, grid))
            lines = [ln.strip() for ln in text.split("\n")]
            lines = [ln for ln in lines if ln]
            if lines and len(lines) == len(boxes):
                out.append(lines)
                log.debug(
                    f"OCR region {ri + 1}/{len(regions)} ({len(boxes)} boxes): {lines!r}"
                )
            else:
                log.warn(
                    f"Region {ri + 1}/{len(regions)}: model returned {len(lines)} "
                    f"line(s) for {len(boxes)} box(es) — falling back per-box"
                )
                out.append(self.ocr_boxes(image_path, boxes))
        return out
