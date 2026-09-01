"""LaMa output handling: scale, un-letterbox, feather, and package a patch."""
from __future__ import annotations

import cv2 as cv
import numpy as np

from .config import OUTPUT_SCALE


def compose_patch(
    output: np.ndarray,
    mask: np.ndarray,
    nw: int,
    nh: int,
    pad_x: int,
    pad_y: int,
) -> np.ndarray:
    """Convert the raw CHW graph output into an RGBA patch (BGR + alpha).

    RGB = inpainted pixels scaled back to 0..255, A = feathered glyph mask
    (same blur the compositor uses) so edges blend into the artwork.
    """
    result = np.asarray(output, dtype=np.float32) * OUTPUT_SCALE
    result = np.transpose(result, (1, 2, 0))
    result = np.clip(result, 0, 255).astype(np.uint8)
    result = result[pad_y : pad_y + nh, pad_x : pad_x + nw]
    result = cv.resize(
        result, (mask.shape[1], mask.shape[0]), interpolation=cv.INTER_LINEAR
    )

    alpha = cv.GaussianBlur(mask, (0, 0), 2).astype(np.float32)
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)
    return np.dstack([result, alpha])
