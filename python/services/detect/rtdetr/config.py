"""RT-DETR-v2 constants."""
from __future__ import annotations

MODEL_ID = "ogkalu/comic-text-and-bubble-detector"
MODEL_FILENAME = "detector.onnx"

INPUT_SIZE = 640
SCORE_THRESHOLD = 0.3

CLASS_MAP = {0: "bubble", 1: "text_bubble", 2: "text_free"}
