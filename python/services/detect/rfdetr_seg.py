"""KoharuLayout RF-DETR Seg 2XL (ShiniShiho ONNX export) via ONNX Runtime.

Model file is downloaded on first run from HuggingFace:
  https://huggingface.co/ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx/resolve/main/rfdetr-seg-2xlarge.onnx

Static-batch FP32 graph (opset 17), fixed input ``[1, 3, 1152, 1152]``.
Predicts bounding boxes + per-instance masks for manga page layout:
  0 = text, 1 = onomatopoeia, 2 = bubble, 3 = panel

Preprocessing (matches the model card):
  - resize to 1152x1152 (bilinear, stretch — the model was trained on this)
  - rescale x 1/255
  - ImageNet normalize (mean 0.485/0.456/0.406, std 0.229/0.224/0.225)

Post-processing:
  - ``dets``   [1, 300, 4]   normalized cxcywh → xyxy x (orig_w, orig_h)
  - ``labels`` [1, 300, 5]   class logits → sigmoid, keep first 4 channels
  - ``masks``  [1, 300, 288, 288] mask logits → bilinear to orig size, > 0
  - per-class thresholds: text 0.25, onomatopoeia 0.20, bubble 0.50, panel 0.50

Mask semantics follow the koharu pipeline (crates/koharu-pipeline):
  - text detections  -> textDetections (type "text_free")
  - bubble detections -> bubbleDetections
  - onomatopoeia + panel are skipped (SFX count as artwork, not removed)
  - the removal mask is the union of TEXT instance masks ONLY (koharu's
    ``mask_for(detections, "text", size)`` — SFX are deliberately excluded),
    then dilate + close with a scale-aware radius, saved as a full-page PNG.

Returns the usual detection dict plus ``maskPath`` pointing at that mask;
``/inpaint`` uses it to skip the heuristic Otsu masking.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np

from utils.logger import log
from .base import BaseDetectModel

MODEL_ID = "ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx"
MODEL_FILENAME = "rfdetr-seg-2xlarge.onnx"
MODEL_URL = f"https://huggingface.co/{MODEL_ID}/resolve/main/{MODEL_FILENAME}"

INPUT_SIZE = 1152  # fixed NCHW input, stretch-resized
MASK_SIZE = 288  # mask head output = input / 4
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

CLASS_NAMES = {0: "text", 1: "onomatopoeia", 2: "bubble", 3: "panel"}
# Recommended confidence thresholds from the model card
CLASS_THRESHOLDS = {0: 0.25, 1: 0.20, 2: 0.50, 3: 0.50}
# SFX are excluded from the removal mask — koharu treats them as artwork
MASK_LABELS = {0}  # "text"

_CACHE_DIR = Path(
    os.environ.get(
        "LUMINA_CACHE_DIR", Path(tempfile.gettempdir()) / "lumina"
    )
)


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


class RfDetrSegModel(BaseDetectModel):
    """KoharuLayout RF-DETR Seg 2XL — text/bubble boxes + instance masks."""

    name = "KoharuLayout RF-DETR Seg (Text + Masks)"

    model_id = MODEL_ID
    model_path = _models_dir() / MODEL_FILENAME

    def __init__(self) -> None:
        self._session = None

    def is_ready(self) -> bool:
        return self.model_path.is_file()

    def size(self) -> Optional[int]:
        if not self.is_ready():
            return None
        return self.model_path.stat().st_size

    def download(self, progress_callback=None) -> None:
        import urllib.request

        if self.is_ready():
            log.info(f"Detect model already present: {self.model_path}")
            return

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.model_path.with_suffix(".onnx.part")

        log.info(f"Downloading detect model {MODEL_URL} ...")
        last_pct = -1

        def _report(pct: int, downloaded: int, total: int) -> None:
            if pct != last_pct:
                log.debug(f"Detect download progress: {pct}%")
                if progress_callback:
                    try:
                        progress_callback(pct, downloaded, total)
                    except Exception:
                        pass

        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "Lumina/0.1"})
        try:
            with urllib.request.urlopen(req) as resp, open(tmp_path, "wb") as f:
                total = int(resp.headers.get("Content-Length", -1))
                downloaded = 0
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = int(downloaded * 100 / total)
                        _report(pct, downloaded, total)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

        tmp_path.rename(self.model_path)
        log.info(f"Detect model download complete: {self.model_path}")

    def _load_session(self):
        import onnxruntime as ort

        if self._session is None:
            if not self.is_ready():
                self.download()

            log.info(f"Loading detect ONNX model: {self.model_path}")
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self._session = ort.InferenceSession(
                str(self.model_path),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            log.info(
                f"Detect ONNX session ready (inputs: "
                f"{[(i.name, i.shape) for i in self._session.get_inputs()]})"
            )
        return self._session

    @staticmethod
    def _preprocess(image_path: str) -> tuple[np.ndarray, int, int]:
        """Load image and prepare model input tensor. Returns (tensor, orig_w, orig_h)."""
        from PIL import Image

        img = Image.open(image_path).convert("RGB")
        w, h = img.size

        resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
        arr = np.asarray(resized, dtype=np.float32) * (1.0 / 255.0)
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
        tensor = arr.transpose(2, 0, 1)[np.newaxis]  # HWC -> CHW -> NCHW
        return np.ascontiguousarray(tensor), w, h

    @staticmethod
    def _postprocess(
        dets: np.ndarray,
        labels: np.ndarray,
        masks: np.ndarray,
        orig_w: int,
        orig_h: int,
    ) -> tuple[dict, Optional[np.ndarray]]:
        """Decode outputs to detection lists + full-page removal mask.

        Returns (result, mask) where mask is a uint8 0/255 full-page image
        (union of text instance masks) or None when nothing to inpaint.
        """
        import cv2 as cv

        # labels: [1, 300, 5] logits -> sigmoid on the 4 class channels
        scores = 1.0 / (1.0 + np.exp(-labels[..., :4]))  # [1, 300, 4]
        class_ids = scores.argmax(axis=-1)[0]  # [300]
        confs = scores.max(axis=-1)[0]  # [300]

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

        # Removal mask = union of text instance masks, dilated + closed
        # (hole-filled) with koharu's scale-aware radius.
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

    @staticmethod
    def _save_mask(mask: np.ndarray, image_path: str) -> str:
        """Write the full-page binary text mask to the session cache dir."""
        import cv2 as cv
        import time

        src = Path(image_path)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        out_dir = _CACHE_DIR / f"{src.stem}_textmask_{stamp}"
        out_dir.mkdir(parents=True, exist_ok=True)
        mask_path = out_dir / "text-mask.png"
        cv.imwrite(str(mask_path), mask)
        return str(mask_path)

    @staticmethod
    def _split_outputs(session, outputs: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Map session outputs to (dets, labels, masks) by output name."""
        by_name = {
            o.name.lower(): np.asarray(out)
            for o, out in zip(session.get_outputs(), outputs)
        }
        if {"dets", "labels", "masks"} <= by_name.keys():
            return by_name["dets"], by_name["labels"], by_name["masks"]
        # Shape fallback: dets [..,4], masks [..,288,288], labels = the rest
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

    def detect(self, image_path: str) -> dict:
        """
        Run detection on an image file.

        Returns { textDetections, bubbleDetections, maskPath? }.
        """
        import cv2 as cv

        session = self._load_session()

        tensor, w, h = self._preprocess(image_path)
        outputs = [np.asarray(o) for o in session.run(None, {"input": tensor})]

        dets, labels, masks = self._split_outputs(session, outputs)
        result, mask = self._postprocess(dets, labels, masks, w, h)

        if mask is not None:
            result["maskPath"] = self._save_mask(mask, image_path)

        log.info(
            f"Detected {len(result['textDetections'])} text, "
            f"{len(result['bubbleDetections'])} bubbles "
            f"(mask: {'yes' if mask is not None else 'no'})"
        )
        return result
