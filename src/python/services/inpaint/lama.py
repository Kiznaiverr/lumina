"""LaMa inpainting model (opencv/inpainting_lama) via ONNX Runtime.

Concrete LaMa configuration on top of :class:`OnnxInpaintModel`. The mask
strategy (glyph-precise Otsu inside the text box) lives in the base class
default — this file only carries model metadata.

Emits one RGBA patch PNG per input box:

  RGB = model output (inpainted pixels)
  A   = feathered mask (Gaussian-blurred text mask, 0..255)

The renderer composites each patch over the original page image at its bbox;
because the alpha channel *is* the feathered mask, the result is visually
identical to the old single cleaned-image output, but every region stays
independently toggleable, deletable, and opacity-adjustable.
"""
from __future__ import annotations

from .onnx import OnnxInpaintModel


class LamaModel(OnnxInpaintModel):
    """Big-LaMa inpainting via ONNX Runtime."""

    name = "LaMa"
    description = (
        "Big-LaMa trained on general imagery (OpenCV 2025 build). "
        "Solid all-round inpainting quality for text regions."
    )

    model_id = "opencv/inpainting_lama"
    model_filename = "inpainting_lama_2025jan.onnx"
    mask_binary = True  # threshold mask to 0/1 before feeding
    output_scale = 1.0  # graph already emits 0..255
