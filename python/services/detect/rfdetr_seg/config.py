"""RF-DETR Seg 2XL model constants."""
from __future__ import annotations

import numpy as np

MODEL_ID = "ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx"
MODEL_FILENAME = "rfdetr-seg-2xlarge.onnx"
PREFER = "auto"  # full auto: CUDA -> DML -> CPU

INPUT_SIZE = 1152  # fixed NCHW input, stretch-resized
MASK_SIZE = 288  # mask head output = input / 4
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

CLASS_THRESHOLDS = {0: 0.25, 1: 0.20, 2: 0.50, 3: 0.50}
