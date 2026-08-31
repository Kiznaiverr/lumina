"""RF-DETR input preparation."""
from __future__ import annotations

import numpy as np
from PIL import Image

from .config import IMAGENET_MEAN, IMAGENET_STD, INPUT_SIZE


def preprocess(image_path: str) -> tuple[np.ndarray, int, int]:
    """Load image -> NCHW tensor (stretch to 1152^2, ImageNet normalize)."""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size

    resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) * (1.0 / 255.0)
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    tensor = arr.transpose(2, 0, 1)[np.newaxis]  # HWC -> CHW -> NCHW
    return np.ascontiguousarray(tensor), w, h
