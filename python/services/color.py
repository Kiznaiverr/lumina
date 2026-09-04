"""Text style detection — dominant glyph color + rotation per text box.

Used right after detection so each dialogue layer can inherit the color
and slant of the original typesetting instead of the global default.

Method (per box):
  1. Background = median color of the 2px border strips (text rarely
     touches the box edges).
  2. Foreground = pixels whose RGB distance from the background exceeds a
     threshold — these are the glyph strokes (+ anti-aliased edges).
  3. Text color = median of the foreground pixels, returned as #rrggbb.
  4. Text angle = direction of maximum variance of the foreground pixels
     (PCA on glyph coordinates), normalized to [-45, 45]° from horizontal.
     Positive = clockwise lean (matches Konva's rotation convention).

Rotation is only reported when the glyph blob is clearly elongated
(eigenvalue ratio guard) — a single character has no dominant direction
and would otherwise produce a random angle.

Robust for dark text on light bubbles and light text on dark bubbles.
Returns None for color/angle when a box is too small, empty, or entirely
filled (no usable foreground/background separation).
"""
from __future__ import annotations

import math
from typing import Optional

import numpy as np
from PIL import Image

from services import anglenet

DIST_THRESHOLD = 40.0
MIN_FG_PIXELS = 20
MAX_FG_RATIO = 0.8
BORDER = 2
MIN_ELONGATION = 2.0  # eigmax/eigmin — below this the blob has no clear direction
MIN_ANGLE = 2.0  # ignore micro-rotations


def _blob_angle(fg_mask: np.ndarray) -> Optional[float]:
    """PCA direction of the glyph pixels, normalized to [-45, 45] degrees."""
    pts = np.column_stack(np.nonzero(fg_mask)).astype(np.float64)  # Nx2 (y, x)
    if pts.shape[0] < MIN_FG_PIXELS:
        return None
    pts -= pts.mean(axis=0)
    cov = pts.T @ pts / pts.shape[0]
    eigvals, eigvecs = np.linalg.eigh(cov)  # ascending; last = max variance
    if eigvals[0] <= 0 or eigvals[1] / eigvals[0] < MIN_ELONGATION:
        return None

    main = eigvecs[:, 1]
    # atan2(y, x): horizontal text → 0; screen-clockwise lean → positive
    # (matches Konva's clockwise-positive rotation).
    angle = math.degrees(math.atan2(main[0], main[1]))
    if angle > 45:
        angle -= 90
    elif angle < -45:
        angle += 90
    if abs(angle) < MIN_ANGLE:
        angle = 0.0
    return round(float(angle), 1)


def _box_style(crop: np.ndarray) -> tuple[Optional[str], Optional[float]]:
    """(color_hex, angle_deg) for one crop; (None, None) when unusable."""
    h, w = crop.shape[:2]
    if h < BORDER * 2 + 2 or w < BORDER * 2 + 2:
        return None, None

    border = np.concatenate(
        [
            crop[:BORDER].reshape(-1, 3),
            crop[-BORDER:].reshape(-1, 3),
            crop[:, :BORDER].reshape(-1, 3),
            crop[:, -BORDER:].reshape(-1, 3),
        ]
    )
    bg = np.median(border.astype(np.float32), axis=0)

    dist = np.sqrt(((crop.astype(np.float32) - bg) ** 2).sum(axis=-1))
    fg_mask = dist > DIST_THRESHOLD
    fg = crop[fg_mask]

    total = h * w
    if fg.shape[0] < MIN_FG_PIXELS or fg.shape[0] > total * MAX_FG_RATIO:
        return None, None

    color = np.median(fg.astype(np.float32), axis=0)
    color_hex = "#%02x%02x%02x" % tuple(int(round(c)) for c in color)
    # Text slant from AngleNet (error ~2.9°) when available, else the PCA
    # heuristic (error ~9°) so translated layers rotate to match the page.
    angle = anglenet.lean_deg(crop)
    if angle is None:
        angle = _blob_angle(fg_mask)
    return color_hex, angle


def detect_text_styles(image_path: str, boxes: list[dict]) -> list[dict]:
    """Return one {"color": str|None, "angle": float|None} per bbox."""
    if not boxes:
        return []

    img = np.asarray(Image.open(image_path).convert("RGB"))
    ih, iw = img.shape[:2]

    styles: list[dict] = []
    for b in boxes:
        x0 = max(0, int(b["x"]))
        y0 = max(0, int(b["y"]))
        x1 = min(iw, int(b["x"]) + max(0, int(b["w"])))
        y1 = min(ih, int(b["y"]) + max(0, int(b["h"])))
        if x1 - x0 < 2 or y1 - y0 < 2:
            styles.append({"color": None, "angle": None})
            continue
        color, angle = _box_style(img[y0:y1, x0:x1])
        styles.append({"color": color, "angle": angle})

    return styles
