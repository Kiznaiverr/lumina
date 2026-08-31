"""manga-ocr (mayocream/manga-ocr-onnx) constants."""
from __future__ import annotations

MODEL_ID = "mayocream/manga-ocr-onnx"
MODEL_DIR_NAME = "manga-ocr-onnx"
REQUIRED_FILES = ["encoder_model.onnx", "decoder_model.onnx", "vocab.txt"]
DOWNLOAD_FILES = REQUIRED_FILES + [
    "preprocessor_config.json",
    "config.json",
    "generation_config.json",
    "special_tokens_map.json",
    "tokenizer_config.json",
]

INPUT_SIZE = 224
MAX_TOKENS = 300
CLS_ID, SEP_ID, PAD_ID = 2, 3, 0
