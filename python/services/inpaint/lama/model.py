"""Big-LaMa inpainting via ONNX Runtime."""
from __future__ import annotations

from ..onnx import OnnxInpaintModel
from .config import MODEL_FILENAME, MODEL_ID


class LamaModel(OnnxInpaintModel):
    name = "LaMa"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME
