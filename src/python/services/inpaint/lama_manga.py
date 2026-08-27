"""Manga-finetuned LaMa (mayocream/lama-manga-onnx) via ONNX Runtime.

The same Big-LaMa architecture as ``lama.py`` but fine-tuned on ~300K
manga/anime images (source: Sanster AnimeMangaInpainting checkpoint),
converted to ONNX by the koharu author. Better text-region reconstruction
on manga/comic artwork than the generic OpenCV build.

Input convention of this export (image 0..1, mask 0..1, output 0..1):
  - image blob scaled 1/255        (same as base)
  - mask blob divided by 255       (NOT thresholded — mask_binary=False)
  - output multiplied by 255       (output_scale=255)
"""
from __future__ import annotations

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
    mask_binary = False
    output_scale = 255.0
