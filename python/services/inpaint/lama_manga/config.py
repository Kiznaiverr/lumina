"""LaMa Manga (mayocream/lama-manga-onnx) constants."""
from __future__ import annotations

MODEL_ID = "mayocream/lama-manga-onnx"
MODEL_FILENAME = "lama-manga.onnx"
PREFER = "cuda"  # CUDA only — never DirectML (FFC MatMul crash)

INPUT_SIZE = 512  # square input after letterboxing
CONTEXT_PAD = 32  # art margin kept around each text box
MASK_DILATE = 4  # glyph mask dilation (px)
MASK_BINARY = True  # threshold mask to 0/1 before feeding
OUTPUT_SCALE = 255.0  # graph outputs 0..1
