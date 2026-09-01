"""LaMa Manga input preparation: per-box text mask + square letterbox + blobs."""
from __future__ import annotations

import cv2 as cv
import numpy as np

from .config import INPUT_SIZE, MASK_BINARY, MASK_DILATE


def build_mask(
    crop: np.ndarray, box_rect: tuple[int, int, int, int]
) -> np.ndarray:
    """Glyph-precise Otsu mask constrained inside the text box.

    Otsu is computed inside the box ONLY (box_rect = detected text box
    relative to the crop), so context-margin art is never erased. Handles
    dark glyphs on light panels and light glyphs on dark panels.
    """
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
        cv.MORPH_ELLIPSE, (MASK_DILATE * 2 + 1,) * 2
    )
    return cv.dilate(mask, kernel)


def letterbox(
    crop: np.ndarray, mask: np.ndarray
) -> tuple[np.ndarray, np.ndarray, int, int, int, int]:
    """Aspect-preserving square padding (image pads with edges, mask with 0).

    Direct resize to INPUT_SIZE squishes wide/short crops and made LaMa
    hallucinate distorted art, so the crop is scaled to fit and centered.
    Returns the padded image, padded mask, scaled size, and pad offsets.
    """
    ch, cw = crop.shape[:2]
    s = INPUT_SIZE
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
    return img_sq, mask_sq, nw, nh, pad_x, pad_y


def make_blobs(
    img_sq: np.ndarray, mask_sq: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """NCHW float blobs; mask binarized to 0/1 when MASK_BINARY, else 0..1."""
    image_blob = cv.dnn.blobFromImage(
        img_sq, 1.0 / 255.0, (INPUT_SIZE, INPUT_SIZE), (0, 0, 0), swapRB=False
    )
    mask_blob = cv.dnn.blobFromImage(
        mask_sq, 1.0, (INPUT_SIZE, INPUT_SIZE), (0,), crop=False
    )
    if MASK_BINARY:
        mask_blob = (mask_blob > 0).astype(np.float32)
    else:
        mask_blob = np.asarray(mask_blob, dtype=np.float32) / 255.0
    return image_blob, mask_blob
