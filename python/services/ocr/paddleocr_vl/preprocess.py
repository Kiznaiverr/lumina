"""PaddleOCR-VL NaViT preprocessing — pure numpy, no ONNX sessions.

Patch counts (ph, pw) are always EVEN: the model merges 2x2 patches and
reshapes attention tensors by grid/2 — an odd count produces a size
mismatch in an internal Reshape (verified on CPU: {594,1152} vs
{1,16,2,9,2,1152} for pw=33).
"""
from __future__ import annotations

import math

import numpy as np

from .config import MAX_PATCHES, _PATCH


def preprocess_region(
    crop,
    *,
    min_pixels: int = 112896,
    max_pixels: int = 0,
    mean=(0.5, 0.5, 0.5),
    std=(0.5, 0.5, 0.5),
) -> tuple[np.ndarray, np.ndarray]:
    """NaViT-style preprocessing -> pixel_values [1,P,3,14,14] + grid [1,3]."""
    from PIL import Image

    w, h = crop.size
    target = max(min_pixels, 1)
    r = math.sqrt(target / max(w * h, 1))
    # nearest EVEN patch count (2x2 merge requires grid/2 to be integer)
    pw = max(2, int(round(w * r / _PATCH / 2)) * 2)
    ph = max(2, int(round(h * r / _PATCH / 2)) * 2)

    def area() -> int:
        return pw * ph * _PATCH * _PATCH

    if area() < target:  # rounding undershoot — bump the smaller axis
        if pw <= ph:
            pw += 2
        else:
            ph += 2
    if max_pixels and area() > max_pixels:
        while area() > max_pixels and pw > 2 and ph > 2:
            if pw >= ph:
                pw -= 2
            else:
                ph -= 2
    # int8 caveat: keep the patch count bounded
    while pw * ph > MAX_PATCHES and pw > 2 and ph > 2:
        if pw >= ph:
            pw -= 2
        else:
            ph -= 2

    w2, h2 = pw * _PATCH, ph * _PATCH
    img = crop.resize((w2, h2), Image.Resampling.BICUBIC)
    arr = np.asarray(img, np.float32) / 255.0
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)  # [3, h2, w2]
    patches = (
        arr.reshape(3, ph, _PATCH, pw, _PATCH)
        .transpose(1, 3, 0, 2, 4)
        .reshape(-1, 3, _PATCH, _PATCH)
    )
    grid = np.array([[1, ph, pw]], np.int64)
    return patches[np.newaxis], grid  # [1,P,3,14,14], [1,3]
