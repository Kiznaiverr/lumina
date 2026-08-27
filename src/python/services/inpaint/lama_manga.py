"""Manga-finetuned LaMa (mayocream/lama-manga-onnx) via ONNX Runtime.

The same Big-LaMa architecture as ``lama.py`` but fine-tuned on ~300K
manga/anime images (source: Sanster AnimeMangaInpainting checkpoint),
converted to ONNX by the koharu author. Better text-region reconstruction
on manga/comic artwork than the generic OpenCV build.

Input convention of this export:
  - image blob scaled 1/255        (same as base)
  - mask must be BINARY 0/1 (hard) — LaMa reads the mask value as inpaint
    strength, and an interpolated soft mask leaves text as a ghost. The
    "mask 0..1" in the model card means the accepted range, not softness;
    this export is a Sanster-fork checkpoint trained on binary masks.
  - output multiplied by 255       (output_scale=255)
"""
from __future__ import annotations

import numpy as np

from .lama import LamaModel


class LamaMangaModel(LamaModel):
    name = "LaMa Manga"
    description = (
        "Big-LaMa fine-tuned on ~300K manga & anime images "
        "(AnimeMangaInpainting, ONNX conversion by koharu). "
        "Best-in-class text-region inpainting for manga pages."
    )

    model_id = "mayocream/lama-manga-onnx"
    model_filename = "lama-manga.onnx"
    # mask_binary stays True (inherited) — see module docstring.
    output_scale = 255.0
    # Mask strategy: inherited glyph-precise default from OnnxInpaintModel —
    # same input as the generic LaMa so the comparison is purely about
    # weights (the manga fine-tune wins on screentone/line-art
    # reconstruction, not on mask shape).
