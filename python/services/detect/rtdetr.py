"""RT-DETR-v2 r50vd (ogkalu/comic-text-and-bubble-detector) via ONNX Runtime.

Model file is downloaded on first run from HuggingFace:
  https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/main/detector.onnx

Preprocessing replicates RTDetrImageProcessor (preprocessor_config.json):
  - resize to 640x640 (bilinear)
  - rescale x 1/255
  - do_normalize = false (no mean/std subtraction)

Post-processing: the Baidu-style export already decodes everything inside
the graph (see tools/export_onnx.py of RT-DETR, output_names=
['labels', 'boxes', 'scores']). With orig_target_sizes given:
  - labels [1, num_queries] int64  (argmax already applied)
  - boxes  [1, num_queries, 4]     absolute xyxy pixels
  - scores [1, num_queries] float32 (sigmoid/topk already applied)
We only threshold by score and map class ids.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np

from utils.logger import log
from .base import BaseDetectModel

MODEL_ID = "ogkalu/comic-text-and-bubble-detector"
MODEL_FILENAME = "detector.onnx"
MODEL_URL = (
    f"https://huggingface.co/{MODEL_ID}/resolve/main/{MODEL_FILENAME}"
)

INPUT_SIZE = 640
SCORE_THRESHOLD = 0.3

# Class IDs from the model
CLASS_MAP = {
    0: "bubble",
    1: "text_bubble",
    2: "text_free",
}


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


class RTDetrModel(BaseDetectModel):
    """RT-DETR v2 r50vd fine-tuned for comics (text + speech bubbles)."""

    name = "RT-DETR Text & Bubble Detector"

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

    def unload(self) -> None:
        """Release the ONNX session (frees VRAM/RAM). Next call reloads."""
        self._session = None

    def _load_session(self):
        if self._session is None:
            from utils.runtime import create_session, make_session_options

            if not self.is_ready():
                self.download()

            log.info(f"Loading detect ONNX model: {self.model_path}")
            self._session = create_session(
                self.model_path, sess_options=make_session_options()
            )
            inputs = {i.name for i in self._session.get_inputs()}
            log.info(f"Detect ONNX session ready (inputs: {inputs})")
        return self._session

    @staticmethod
    def _preprocess(image_path: str) -> tuple[np.ndarray, int, int]:
        """Load image and prepare model input tensor. Returns (tensor, orig_w, orig_h)."""
        from PIL import Image

        img = Image.open(image_path).convert("RGB")
        w, h = img.size

        resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
        arr = np.asarray(resized, dtype=np.float32) * (1.0 / 255.0)
        tensor = arr.transpose(2, 0, 1)[np.newaxis]  # HWC -> CHW -> NCHW
        return np.ascontiguousarray(tensor), w, h

    @staticmethod
    def _postprocess(
        labels: np.ndarray,
        boxes: np.ndarray,
        scores: np.ndarray,
        orig_w: int,
        orig_h: int,
    ) -> dict:
        """Convert decoded outputs to detection lists."""
        text_detections = []
        bubble_detections = []

        # Baidu-style export: everything is already decoded. Boxes are absolute
        # xyxy pixels (scaled to orig_target_sizes), NOT normalized cxcywh.
        for box_xyxy, score, cls_id in zip(boxes[0], scores[0], labels[0]):
            if score < SCORE_THRESHOLD:
                continue
            xmin, ymin, xmax, ymax = box_xyxy

            x0 = max(0.0, float(xmin))
            y0 = max(0.0, float(ymin))
            x1 = min(float(orig_w), float(xmax))
            y1 = min(float(orig_h), float(ymax))

            # Skip degenerate boxes (inverted or zero-size after clamping)
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

    def detect(self, image_path: str) -> dict:
        """
        Run detection on an image file.
        Returns { textDetections: [...], bubbleDetections: [...] }.
        """
        session = self._load_session()

        tensor, w, h = self._preprocess(image_path)

        # Baidu-style export takes a second input: original image size (W, H).
        # Official reference (rtdetrv2_onnxruntime.py) passes torch.tensor([w, h]).
        # With it, the model outputs boxes in absolute xyxy pixels.
        feed = {
            "images": tensor,
            "orig_target_sizes": np.array([[w, h]], dtype=np.int64),
        }
        outputs = [np.asarray(o) for o in session.run(None, feed)]

        labels, boxes, scores = self._split_outputs(session, outputs)
        result = self._postprocess(labels, boxes, scores, w, h)
        log.info(
            f"Detected {len(result['textDetections'])} text, "
            f"{len(result['bubbleDetections'])} bubbles"
        )
        return result

    @staticmethod
    def _split_outputs(session, outputs: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Map session outputs to (labels, boxes, scores).

        Prefer output names ('labels', 'boxes', 'scores'); fall back to shapes.
        """
        by_name: dict[str, np.ndarray] = {}
        if hasattr(session, "get_outputs") and session is not None:
            names = [o.name.lower() for o in session.get_outputs()]
            for name, out in zip(names, outputs):
                by_name[name] = np.asarray(out)

        if {"labels", "boxes", "scores"} <= by_name.keys():
            return by_name["labels"], by_name["boxes"], by_name["scores"]

        # Shape fallback: boxes [N,4], labels/scores [N]. Distinguish labels vs
        # scores by dtype (int vs float).
        arrs = [np.asarray(o) for o in outputs]
        boxes = next(a for a in arrs if a.ndim == 3 and a.shape[-1] == 4)
        vecs = [a for a in arrs if a is not boxes]
        scores = next(a for a in vecs if np.issubdtype(a.dtype, np.floating))
        labels = next(a for a in vecs if a is not scores)
        return labels, boxes, scores
