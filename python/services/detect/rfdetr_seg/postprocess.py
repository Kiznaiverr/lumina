"""RF-DETR output decoding."""
from __future__ import annotations

from typing import Optional

import numpy as np

from .config import CLASS_THRESHOLDS, MASK_SIZE


def split_outputs(
    session, outputs: list[np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map session outputs to (dets, labels, masks) by name; shape fallback."""
    by_name = {
        o.name.lower(): np.asarray(out)
        for o, out in zip(session.get_outputs(), outputs)
    }
    if {"dets", "labels", "masks"} <= by_name.keys():
        return by_name["dets"], by_name["labels"], by_name["masks"]

    dets = labels = masks = None
    for out in outputs:
        arr = np.asarray(out)
        if arr.ndim == 2 and arr.shape[-1] == 4:
            dets = arr
        elif arr.ndim == 3 and arr.shape[-1] == MASK_SIZE:
            masks = arr
        else:
            labels = arr
    if dets is None or labels is None or masks is None:
        raise ValueError(
            "Unexpected RF-DETR output shapes; cannot map to "
            "(dets, labels, masks): "
            f"{[np.asarray(o).shape for o in outputs]}"
        )
    return dets, labels, masks


def postprocess(
    dets: np.ndarray,
    labels: np.ndarray,
    masks: np.ndarray,
    orig_w: int,
    orig_h: int,
) -> tuple[dict, Optional[np.ndarray]]:
    """Decode outputs -> detection lists + full-page removal mask.

    The mask is the union of TEXT instance masks only (SFX count as artwork,
    per koharu), dilated + closed with a scale-aware radius; None when no text.
    """
    import cv2 as cv

    scores = 1.0 / (1.0 + np.exp(-labels[..., :4]))  # [1, 300, 4]
    class_ids = scores.argmax(axis=-1)[0]
    confs = scores.max(axis=-1)[0]

    text_detections = []
    bubble_detections = []
    text_masks: list[np.ndarray] = []

    for i in range(int(dets.shape[1])):
        cls = int(class_ids[i])
        conf = float(confs[i])
        if conf < CLASS_THRESHOLDS.get(cls, 0.5):
            continue

        cx, cy, bw, bh = dets[0, i]
        x0 = max(0.0, float(cx - bw / 2) * orig_w)
        y0 = max(0.0, float(cy - bh / 2) * orig_h)
        x1 = min(float(orig_w), float(cx + bw / 2) * orig_w)
        y1 = min(float(orig_h), float(cy + bh / 2) * orig_h)
        if x1 - x0 < 1.0 or y1 - y0 < 1.0:
            continue

        bbox = {
            "x": int(round(x0)),
            "y": int(round(y0)),
            "w": int(round(x1 - x0)),
            "h": int(round(y1 - y0)),
        }
        conf = round(conf, 4)

        if cls == 0:  # text
            text_detections.append(
                {"bbox": bbox, "type": "text_free", "confidence": conf}
            )
            text_masks.append(np.asarray(masks[0, i]))
        elif cls == 2:  # bubble
            bubble_detections.append({"bbox": bbox, "confidence": conf})
        # cls 1 (onomatopoeia) and cls 3 (panel) are skipped

    result = {
        "textDetections": text_detections,
        "bubbleDetections": bubble_detections,
    }

    if not text_masks:
        return result, None

    mask = np.zeros((orig_h, orig_w), np.uint8)
    for m in text_masks:
        up = cv.resize(m, (orig_w, orig_h), interpolation=cv.INTER_LINEAR)
        mask[up > 0] = 255

    radius = int(round((max(orig_w, orig_h) / 1024.0) * 6.0))
    radius = max(1, min(255, radius))
    kernel = cv.getStructuringElement(
        cv.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)
    )
    mask = cv.dilate(mask, kernel)
    mask = cv.morphologyEx(mask, cv.MORPH_CLOSE, kernel)
    return result, mask
