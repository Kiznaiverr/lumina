"""Text color detection — dominant glyph color per text box.

Used right after detection so each dialogue layer can inherit the color of
the original typesetting instead of the global default.

Method (per box):
  1. Background = median color of the 2px border strips (text rarely
     touches the box edges).
  2. Foreground = pixels whose RGB distance from the background exceeds a
     threshold — these are the glyph strokes (+ anti-aliased edges).
  3. Text color = median of the foreground pixels, returned as #rrggbb.

Robust for dark text on light bubbles and light text on dark bubbles.
Returns None when a box is too small, empty, or entirely filled (no usable
foreground/background separation).
"""
from __future__ import annotations

from typing import Optional

import numpy as np
from PIL import Image

DIST_THRESHOLD = 40.0
MIN_FG_PIXELS = 20
MAX_FG_RATIO = 0.8
BORDER = 2


def _box_text_color(crop: np.ndarray) -> Optional[str]:
    h, w = crop.shape[:2]
    if h < BORDER * 2 + 2 or w < BORDER * 2 + 2:
        return None

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
    fg = crop[dist > DIST_THRESHOLD]

    total = h * w
    if fg.shape[0] < MIN_FG_PIXELS or fg.shape[0] > total * MAX_FG_RATIO:
        return None

    color = np.median(fg.astype(np.float32), axis=0)
    return "#%02x%02x%02x" % tuple(int(round(c)) for c in color)


def detect_text_colors(image_path: str, boxes: list[dict]) -> list[Optional[str]]:
    """Return one hex color (or None) per bbox, positionally aligned."""
    if not boxes:
        return []

    img = np.asarray(Image.open(image_path).convert("RGB"))
    ih, iw = img.shape[:2]

    colors: list[Optional[str]] = []
    for b in boxes:
        x0 = max(0, int(b["x"]))
        y0 = max(0, int(b["y"]))
        x1 = min(iw, int(b["x"]) + max(0, int(b["w"])))
        y1 = min(ih, int(b["y"]) + max(0, int(b["h"])))
        if x1 - x0 < 2 or y1 - y0 < 2:
            colors.append(None)
            continue
        colors.append(_box_text_color(img[y0:y1, x0:x1]))

    return colors
