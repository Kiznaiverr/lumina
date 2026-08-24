"""Detection service — RT-DETR-v2 r50vd (ogkalu/comic-text-and-bubble-detector) via ONNX Runtime.

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

import numpy as np

MODEL_ID = "ogkalu/comic-text-and-bubble-detector"
MODEL_FILENAME = "detector.onnx"
MODEL_URL = (
    f"https://huggingface.co/{MODEL_ID}/resolve/main/{MODEL_FILENAME}"
)

# Model cache dir: <repo>/models (override with LUMINA_MODEL_DIR env var)
_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[2] / "models")
)
MODEL_PATH = _MODELS_DIR / MODEL_FILENAME

INPUT_SIZE = 640
SCORE_THRESHOLD = 0.3

# Class IDs from the model
CLASS_MAP = {
    0: "bubble",
    1: "text_bubble",
    2: "text_free",
}

_session = None

# Optional callback set by main.py: progress_cb(percent:int, downloaded:int, total:int)
progress_callback = None


def is_model_ready() -> bool:
    """Check if the ONNX model file exists locally."""
    return MODEL_PATH.is_file()


def download_model() -> None:
    """Download the ONNX model from HuggingFace. Blocks until done."""
    import urllib.request

    if is_model_ready():
        print(f"[Lumina] Model already present: {MODEL_PATH}")
        return

    _MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = MODEL_PATH.with_suffix(".onnx.part")

    print(f"[Lumina] Downloading model {MODEL_URL} ...")
    last_pct = -1

    def _report(pct: int, downloaded: int, total: int) -> None:
        if pct != last_pct:
            print(f"[Lumina] Download progress: {pct}%")
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

    tmp_path.rename(MODEL_PATH)
    print(f"[Lumina] Model download complete: {MODEL_PATH}")


def _load_session():
    global _session
    if _session is None:
        import onnxruntime as ort

        if not is_model_ready():
            download_model()

        print(f"[Lumina] Loading ONNX model: {MODEL_PATH}")
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(
            str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        inputs = {i.name for i in _session.get_inputs()}
        print(f"[Lumina] ONNX session ready (inputs: {inputs})")
    return _session


def _preprocess(image_path: str) -> tuple[np.ndarray, int, int]:
    """Load image and prepare model input tensor. Returns (tensor, orig_w, orig_h)."""
    from PIL import Image

    img = Image.open(image_path).convert("RGB")
    w, h = img.size

    resized = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) * (1.0 / 255.0)
    tensor = arr.transpose(2, 0, 1)[np.newaxis]  # HWC -> CHW -> NCHW
    return np.ascontiguousarray(tensor), w, h


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


def _split_outputs(outputs: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map session outputs to (labels, boxes, scores).

    Prefer output names ('labels', 'boxes', 'scores'); fall back to shapes.
    """
    by_name: dict[str, np.ndarray] = {}
    if hasattr(_session, "get_outputs") and _session is not None:
        names = [o.name.lower() for o in _session.get_outputs()]
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


def detect(image_path: str) -> dict:
    """
    Run detection on an image file.
    Returns { textDetections: [...], bubbleDetections: [...] }.
    """
    session = _load_session()

    tensor, w, h = _preprocess(image_path)

    # Baidu-style export takes a second input: original image size (W, H).
    # Official reference (rtdetrv2_onnxruntime.py) passes torch.tensor([w, h]).
    # With it, the model outputs boxes in absolute xyxy pixels.
    feed = {
        "images": tensor,
        "orig_target_sizes": np.array([[w, h]], dtype=np.int64),
    }
    outputs = [np.asarray(o) for o in session.run(None, feed)]

    labels, boxes, scores = _split_outputs(outputs)
    result = _postprocess(labels, boxes, scores, w, h)
    print(
        f"[Lumina] Detected {len(result['textDetections'])} text, "
        f"{len(result['bubbleDetections'])} bubbles"
    )
    return result
