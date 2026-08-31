"""RT-DETR-v2 r50vd (ogkalu comic detector) via ONNX Runtime."""
from __future__ import annotations

import numpy as np

from utils.logger import log

from ..base import BaseDetectModel
from .config import MODEL_FILENAME, MODEL_ID
from . import postprocess as pp
from . import preprocess as prep


class RTDetrModel(BaseDetectModel):
    """RT-DETR v2 r50vd fine-tuned for comics (text + speech bubbles)."""

    name = "RT-DETR Text & Bubble Detector"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME

    def detect(self, image_path: str) -> dict:
        session = self._load_session()

        tensor, w, h = prep.preprocess(image_path)
        # Second input = original size; graph then outputs boxes in absolute pixels
        feed = {
            "images": tensor,
            "orig_target_sizes": np.array([[w, h]], dtype=np.int64),
        }
        outputs = [np.asarray(o) for o in session.run(None, feed)]

        labels, boxes, scores = pp.split_outputs(session, outputs)
        result = pp.postprocess(labels, boxes, scores, w, h)
        log.info(
            f"Detected {len(result['textDetections'])} text, "
            f"{len(result['bubbleDetections'])} bubbles"
        )
        return result
