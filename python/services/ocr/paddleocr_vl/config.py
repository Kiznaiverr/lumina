"""PaddleOCR-VL 1.6 (iaa2005/PaddleOCR-VL-1.6-ONNX) constants."""
from __future__ import annotations

MODEL_ID = "iaa2005/PaddleOCR-VL-1.6-ONNX"
MODEL_DIR_NAME = "paddleocr-vl-1.6"
REQUIRED_FILES = [
    "onnx/vision_encoder_q8.onnx",
    "onnx/decoder_q8.onnx",
    "onnx/embedding.onnx",
    "tokenizer.json",
    "preprocessor_config.json",
    "config.json",
]
DOWNLOAD_FILES = REQUIRED_FILES

MAX_NEW_TOKENS = 256
MAX_PATCHES = 1024  # cap on [P] after resize (int8 degrades on long seqs)
_PLACEHOLDER_ID = 100295  # <|IMAGE_PLACEHOLDER|>; verified at load
_EOS_FALLBACK = 100294  # <|end_of_sentence|>; verified at load
_PREFIX = "<|begin_of_sentence|>User: <|IMAGE_START|>"
_SUFFIX = "<|IMAGE_END|>OCR:\nAssistant:\n"
_PATCH = 14  # NaViT patch size
