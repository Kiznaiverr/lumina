"""Full-page removal mask output."""
from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

import cv2 as cv
import numpy as np

_CACHE_DIR = Path(
    os.environ.get("LUMINA_CACHE_DIR", Path(tempfile.gettempdir()) / "lumina")
)


def save_mask(mask: np.ndarray, image_path: str) -> str:
    """Write the binary text mask to the session cache dir; return its path."""
    src = Path(image_path)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = _CACHE_DIR / f"{src.stem}_textmask_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    mask_path = out_dir / "text-mask.png"
    cv.imwrite(str(mask_path), mask)
    return str(mask_path)
