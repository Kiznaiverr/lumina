"""PP-OCRv6 preprocessing — PaddleX RecResizeImg mirror + line splitting."""
from __future__ import annotations

import math

import numpy as np

from .config import MAX_IMG_W, REC_IMAGE_SHAPE


def to_bgr(crop) -> np.ndarray:
    """PIL RGB crop -> BGR ndarray (the model was trained on BGR)."""
    return np.asarray(crop)[:, :, ::-1]


def split_lines(img: np.ndarray) -> tuple[list[np.ndarray], bool]:
    """Split a bubble crop into line-level crops for recognition.

    PP-OCRv6 is line-level; a whole bubble (multi-line/column) fails.
    Vertical crops are rotated 90° CCW (columns read right-to-left, so
    the rightmost column lands on top). Lines are found by grouping
    character boxes that overlap in y — robust to columns only ~1px
    apart, where projection-based banding fails.

    Returns (lines, vertical): line crops in reading order and whether
    the bubble was vertical. Callers join vertical columns without
    newline (one logical line), horizontal lines with "\n".
    """
    import cv2

    h, w = img.shape[:2]
    vertical = h > w
    if vertical:
        img = np.rot90(img)  # CCW
    h, w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, bin_ = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    contours, _ = cv2.findContours(
        bin_, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    min_area = max(9, (w * h) * 0.0002)
    boxes: list[tuple[int, int, int, int]] = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 6 or bh < 6 or bw * bh < min_area:
            continue
        boxes.append((x, y, x + bw, y + bh))

    # Join a box to a group when >=60% of its height overlaps the group;
    # plain any-overlap chains separate lines via thin crossings.
    boxes.sort(key=lambda b: b[1])
    groups: list[list[tuple[int, int, int, int]]] = []
    for b in boxes:
        for g in groups:
            g_y0 = min(bx[1] for bx in g)
            g_y1 = max(bx[3] for bx in g)
            overlap = min(b[3], g_y1) - max(b[1], g_y0)
            if overlap / (b[3] - b[1]) >= 0.6:
                g.append(b)
                break
        else:
            groups.append([b])

    lines: list[np.ndarray] = []
    for g in sorted(groups, key=lambda g: min(b[1] for b in g)):
        x0 = max(0, min(b[0] for b in g) - 4)
        x1 = min(w, max(b[2] for b in g) + 4)
        y0 = max(0, min(b[1] for b in g) - 4)
        y1 = min(h, max(b[3] for b in g) + 4)
        lines.append(img[y0:y1, x0:x1])
    return (lines or [img]), vertical


def preprocess(img: np.ndarray) -> np.ndarray:
    """Mirror PaddleX RecResizeImg -> [3, 48, W] float32 in [-1, 1].

    Vertical crops (h > w) are rotated 90° CCW first: the model is
    horizontal-only, and CCW rotation maps Japanese vertical reading
    order (columns right-to-left, chars top-to-bottom) to LTR.
    """
    import cv2

    img_c, img_h, base_img_w = REC_IMAGE_SHAPE
    h, w = img.shape[:2]
    if h > w:
        img = np.rot90(img)  # CCW
        h, w = w, h
    max_wh_ratio = max(base_img_w / img_h, w / h)
    img_w = int(img_h * max_wh_ratio)
    if img_w > MAX_IMG_W:
        img_w = MAX_IMG_W
        resized_w = MAX_IMG_W
    else:
        ratio = w / float(h)
        if math.ceil(img_h * ratio) > img_w:
            resized_w = img_w
        else:
            resized_w = int(math.ceil(img_h * ratio))
    resized = cv2.resize(img, (resized_w, img_h))
    resized = resized.astype("float32").transpose((2, 0, 1)) / 255
    resized -= 0.5
    resized /= 0.5
    out = np.zeros((img_c, img_h, img_w), dtype=np.float32)
    out[:, :, :resized_w] = resized
    return out
