"""RT-DETR output decoding."""
from __future__ import annotations

import numpy as np

from .config import CLASS_MAP, SCORE_THRESHOLD


def split_outputs(
    session, outputs: list[np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map session outputs to (labels, boxes, scores) by name; shape fallback."""
    by_name = {
        o.name.lower(): np.asarray(out)
        for o, out in zip(session.get_outputs(), outputs)
    }
    if {"labels", "boxes", "scores"} <= by_name.keys():
        return by_name["labels"], by_name["boxes"], by_name["scores"]

    arrs = [np.asarray(o) for o in outputs]
    boxes = next(a for a in arrs if a.ndim == 3 and a.shape[-1] == 4)
    vecs = [a for a in arrs if a is not boxes]
    scores = next(a for a in vecs if np.issubdtype(a.dtype, np.floating))
    labels = next(a for a in vecs if a is not scores)
    return labels, boxes, scores


def postprocess(
    labels: np.ndarray,
    boxes: np.ndarray,
    scores: np.ndarray,
    orig_w: int,
    orig_h: int,
) -> dict:
    """Threshold decoded outputs into detection lists."""
    text_detections = []
    bubble_detections = []

    # Baidu-style export already decodes: absolute xyxy pixels, argmax applied
    for box_xyxy, score, cls_id in zip(boxes[0], scores[0], labels[0]):
        if score < SCORE_THRESHOLD:
            continue
        xmin, ymin, xmax, ymax = box_xyxy

        x0 = max(0.0, float(xmin))
        y0 = max(0.0, float(ymin))
        x1 = min(float(orig_w), float(xmax))
        y1 = min(float(orig_h), float(ymax))
        if x1 - x0 < 1.0 or y1 - y0 < 1.0:
            continue

        bbox = {
            "x": int(round(x0)),
            "y": int(round(y0)),
            "w": int(round(x1 - x0)),
            "h": int(round(y1 - y0)),
        }
        conf = round(float(score), 4)
        cls_name = CLASS_MAP.get(int(cls_id), "bubble")

        if cls_name == "bubble":
            bubble_detections.append({"bbox": bbox, "confidence": conf})
        else:
            text_detections.append(
                {"bbox": bbox, "type": cls_name, "confidence": conf}
            )

    return {
        "textDetections": text_detections,
        "bubbleDetections": bubble_detections,
    }
