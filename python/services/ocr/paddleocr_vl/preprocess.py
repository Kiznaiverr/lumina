"""PaddleOCR-VL NaViT preprocessing — pure numpy, no ONNX sessions.

Patch counts (ph, pw) are always EVEN: the model merges 2x2 patches and
reshapes attention tensors by grid/2 — an odd count produces a size
mismatch in an internal Reshape (verified on CPU: {594,1152} vs
{1,16,2,9,2,1152} for pw=33).

Crops whose area already falls in [min_pixels, max_pixels] are NOT
resized (native resolution — the HF demo reads blocks this way). The
int8 build degrades on long sequences, so the patch budget is capped at
MAX_PATCHES (card: 1300 image tokens -> gibberish, ~200-256 works).
"""
from __future__ import annotations

import math

import numpy as np

from .config import MAX_PATCHES, _PATCH


def _next_even(v: int) -> int:
    return max(2, v + (v % 2))


def _patch_grid(
    pw: int, ph: int, target: int, max_pixels: int, budget: int
) -> tuple[int, int]:
    """Even patch counts at or above `target` area, within caps.

    Starting counts must already be even. Grows the smaller axis to reach
    `target` (never downscales below it), then caps to `max_pixels` and
    the patch `budget` by shrinking the larger axis.
    """
    def area() -> int:
        return pw * ph * _PATCH * _PATCH

    while area() < target:  # rounding undershoot — bump the smaller axis
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
    while pw * ph > budget and pw > 2 and ph > 2:
        if pw >= ph:
            pw -= 2
        else:
            ph -= 2
    return pw, ph


def preprocess_region(
    crop,
    *,
    min_pixels: int = 112896,
    max_pixels: int = 0,
    budget: int = MAX_PATCHES,
    mean=(0.5, 0.5, 0.5),
    std=(0.5, 0.5, 0.5),
) -> tuple[np.ndarray, np.ndarray]:
    """NaViT-style preprocessing -> pixel_values [1,P,3,14,14] + grid [1,3].

    The crop is kept at native resolution whenever its area already sits in
    [min_pixels, max_pixels]: the int8 model reads native-resolution blocks
    correctly (that's what the HF demo does), and upscaling small crops
    blurs glyphs and triggers hallucination. Only crops BELOW the minimum
    are resized up, and only to reach that minimum — never a fixed size.
    """
    from PIL import Image

    w, h = crop.size
    target = max(min_pixels, 1)
    r = math.sqrt(target / max(w * h, 1))
    if r > 1.0:  # crop below the minimum — scale up to min_pixels only
        pw = _next_even(int(round(w * r / _PATCH)))
        ph = _next_even(int(round(h * r / _PATCH)))
    else:  # native resolution — even-count only, then capped below
        pw = _next_even(int(round(w / _PATCH)))
        ph = _next_even(int(round(h / _PATCH)))
    pw, ph = _patch_grid(pw, ph, target, max_pixels, budget)

    w2, h2 = pw * _PATCH, ph * _PATCH
    if (w2, h2) == (w, h):
        img = crop
    else:
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
