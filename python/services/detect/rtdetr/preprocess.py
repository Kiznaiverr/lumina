"""RT-DETR input preparation."""
from __future__ import annotations

import numpy as np
from PIL import Image

from .config import INPUT_SIZE


def preprocess(image_path: str) -> tuple[np.ndarray, int, int]:
    """Load image -> NCHW tensor (stretch to 640^2, rescale 1/255, no mean/std)."""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size

    resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) * (1.0 / 255.0)
    tensor = arr.transpose(2, 0, 1)[np.newaxis]
    return np.ascontiguousarray(tensor), w, h
