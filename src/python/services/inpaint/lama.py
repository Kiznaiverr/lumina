"""LaMa inpainting model (opencv/inpainting_lama) via ONNX Runtime.

Concrete LaMa configuration on top of :class:`OnnxInpaintModel`. The only
LaMa-specific piece is the mask strategy: Otsu threshold + dilation.

Emits one RGBA patch PNG per input box:

  RGB = model output (inpainted pixels)
  A   = feathered mask (Gaussian-blurred text mask, 0..255)

The renderer composites each patch over the original page image at its bbox;
because the alpha channel *is* the feathered mask, the result is visually
identical to the old single cleaned-image output, but every region stays
independently toggleable, deletable, and opacity-adjustable.
"""
from __future__ import annotations

import numpy as np

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

    def _build_mask(self, crop: np.ndarray) -> np.ndarray:
        import cv2 as cv

        gray = cv.cvtColor(crop, cv.COLOR_RGB2GRAY)
        _, mask = cv.threshold(gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
        kernel = cv.getStructuringElement(
            cv.MORPH_ELLIPSE, (self.mask_dilate * 2 + 1,) * 2
        )
        return cv.dilate(mask, kernel)
