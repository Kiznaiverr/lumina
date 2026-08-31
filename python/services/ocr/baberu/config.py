"""Baberu OCR (genshiai-daichi/baberu-ocr) constants."""
from __future__ import annotations

import numpy as np

MODEL_ID = "genshiai-daichi/baberu-ocr"
MODEL_DIR_NAME = "baberu-ocr"
VISION_FILE = "onnx/vision_int4.onnx"  # smallest tier; fp16 available too
REQUIRED_FILES = [
    VISION_FILE,
    "onnx/decoder_prefill_int8.onnx",
    "onnx/decoder_step_int8.onnx",
    "tokenizer/vocab.json",
]
DOWNLOAD_FILES = REQUIRED_FILES

INPUT_SIZE = 224
MAX_NEW_TOKENS = 128
REPETITION_PENALTY = 1.2
MAX_CONTENT_RUN = 12
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
_PAST = [f"past_k{i}" for i in range(6)] + [f"past_v{i}" for i in range(6)]
