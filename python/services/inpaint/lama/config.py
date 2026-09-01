"""LaMa (opencv/inpainting_lama) constants."""
from __future__ import annotations

MODEL_ID = "opencv/inpainting_lama"
MODEL_FILENAME = "inpainting_lama_2025jan.onnx"
PREFER = "cpu"  # CPU only — GPU toggle ignored (FFC crashes DML; quantized graph crashes CUDA)

INPUT_SIZE = 512  # square input after letterboxing
CONTEXT_PAD = 32  # art margin kept around each text box
MASK_DILATE = 4  # glyph mask dilation (px)
MASK_BINARY = True  # threshold mask to 0/1 before feeding
OUTPUT_SCALE = 1.0  # graph output range multiplier
