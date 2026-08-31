"""PP-OCRv6 medium rec (PaddlePaddle) constants."""
from __future__ import annotations

MODEL_ID = "PaddlePaddle/PP-OCRv6_medium_rec_onnx"
MODEL_DIR_NAME = "ppocrv6"
REQUIRED_FILES = ["inference.onnx", "inference.yml"]
DOWNLOAD_FILES = REQUIRED_FILES

REC_IMAGE_SHAPE = (3, 48, 320)  # C, H, base W (PaddleX default)
MAX_IMG_W = 3200
