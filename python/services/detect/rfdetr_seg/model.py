"""KoharuLayout RF-DETR Seg 2XL (ShiniShiho ONNX) via ONNX Runtime."""
from __future__ import annotations

import numpy as np

from utils.logger import log

from ..base import BaseDetectModel
from .config import MODEL_FILENAME, MODEL_ID
from . import mask as mask_io
from . import postprocess as pp
from . import preprocess as prep


class RfDetrSegModel(BaseDetectModel):
    """Text/bubble boxes + instance masks for manga pages."""

    name = "KoharuLayout RF-DETR Seg (Text + Masks)"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME

    def detect(self, image_path: str) -> dict:
        session = self._load_session()

        tensor, w, h = prep.preprocess(image_path)
        outputs = [np.asarray(o) for o in session.run(None, {"input": tensor})]

        dets, labels, masks = pp.split_outputs(session, outputs)
        result, mask = pp.postprocess(dets, labels, masks, w, h)

        if mask is not None:
            result["maskPath"] = mask_io.save_mask(mask, image_path)

        log.info(
            f"Detected {len(result['textDetections'])} text, "
            f"{len(result['bubbleDetections'])} bubbles "
            f"(mask: {'yes' if mask is not None else 'no'})"
        )
        return result
