"""Inpainting service — LaMa via ONNX Runtime.

Model: opencv/inpainting_lama (inpainting_lama_2025jan.onnx, ~93 MB)
  https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx

The model takes an image blob + binary mask blob, both resized to 512x512.
To preserve quality we inpaint per-detection: crop the bbox region with
padding, run the model on the crop, then paste the inpainted crop back.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

MODEL_ID = "opencv/inpainting_lama"
MODEL_FILENAME = "inpainting_lama_2025jan.onnx"
MODEL_URL = f"https://huggingface.co/{MODEL_ID}/resolve/main/{MODEL_FILENAME}"

_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[2] / "models")
)
MODEL_PATH = _MODELS_DIR / MODEL_FILENAME

INPUT_SIZE = 512
# Padding around the bbox so the model sees surrounding context (px)
CONTEXT_PAD = 32
# Expand the text mask a bit beyond tight glyph pixels (dilate radius px)
MASK_DILATE = 4

_session = None

# Optional callback set by main.py: progress_cb(percent:int, downloaded:int, total:int)
progress_callback = None


def is_model_ready() -> bool:
    return MODEL_PATH.is_file()


def download_model() -> None:
    """Download the ONNX model from HuggingFace. Blocks until done."""
    import urllib.request

    if is_model_ready():
        print(f"[Lumina] Inpaint model already present: {MODEL_PATH}")
        return

    _MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = MODEL_PATH.with_suffix(".onnx.part")

    print(f"[Lumina] Downloading inpaint model {MODEL_URL} ...")
    last_pct = -1
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
                    if pct != last_pct:
                        last_pct = pct
                        print(f"[Lumina] Inpaint download progress: {pct}%")
                        if progress_callback:
                            try:
                                progress_callback(pct, downloaded, total)
                            except Exception:
                                pass
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    tmp_path.rename(MODEL_PATH)
    print(f"[Lumina] Inpaint model download complete: {MODEL_PATH}")


def _load_session():
    global _session
    if _session is None:
        import onnxruntime as ort

        if not is_model_ready():
            download_model()

        print(f"[Lumina] Loading inpaint ONNX model: {MODEL_PATH}")
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(
            str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        inputs = [(i.name, i.shape) for i in _session.get_inputs()]
        print(f"[Lumina] Inpaint session ready (inputs: {inputs})")
    return _session


def _build_text_mask(crop: "np.ndarray") -> "np.ndarray":
    """Build a mask covering dark text glyphs inside the bubble crop.

    Manga text is dark-on-light; thresholding catches glyphs while leaving
    the light bubble interior unmasked. The mask is dilated to cover
    anti-aliased edges.
    """
    import cv2 as cv

    gray = cv.cvtColor(crop, cv.COLOR_RGB2GRAY)
    # Otsu threshold separates dark glyphs from light bubble background
    _, mask = cv.threshold(gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (MASK_DILATE * 2 + 1,) * 2)
    mask = cv.dilate(mask, kernel)
    return mask


def inpaint_boxes(image_path: str, boxes: list[dict], output_path: str) -> str:
    """Inpaint all given bboxes in the image; write result to output_path."""
    import cv2 as cv

    session = _load_session()
    img = cv.imread(image_path)  # BGR
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    h, w = img.shape[:2]

    for box in boxes:
        x0 = max(0, int(box["x"]) - CONTEXT_PAD)
        y0 = max(0, int(box["y"]) - CONTEXT_PAD)
        x1 = min(w, int(box["x"] + box["w"]) + CONTEXT_PAD)
        y1 = min(h, int(box["y"] + box["h"]) + CONTEXT_PAD)
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue

        crop = img[y0:y1, x0:x1]
        ch, cw = crop.shape[:2]

        # Mask over the whole crop (text glyphs detected inside it)
        mask = _build_text_mask(crop)

        # Model expects fixed 512x512 inputs
        image_blob = cv.dnn.blobFromImage(
            crop, 1.0 / 255.0, (INPUT_SIZE, INPUT_SIZE), (0, 0, 0), swapRB=False
        )
        mask_blob = cv.dnn.blobFromImage(
            mask, 1.0, (INPUT_SIZE, INPUT_SIZE), (0,), crop=False
        )
        mask_blob = (mask_blob > 0).astype(np.float32)

        feed = {}
        for inp in session.get_inputs():
            if "mask" in inp.name.lower():
                feed[inp.name] = mask_blob
            else:
                feed[inp.name] = image_blob

        output = np.asarray(session.run(None, feed)[0])[0]  # CHW, 0..255 float

        # Back to HUV crop size
        result = np.transpose(output, (1, 2, 0))
        result = np.clip(result, 0, 255).astype(np.uint8)
        result = cv.resize(result, (cw, ch), interpolation=cv.INTER_LINEAR)

        # Paste back only masked pixels (keep original elsewhere) with a
        # slightly feathered blend to avoid hard seams
        blend_mask = cv.GaussianBlur(mask, (0, 0), 2).astype(np.float32) / 255.0
        blend_mask = blend_mask[..., np.newaxis]
        blended = (
            result.astype(np.float32) * blend_mask
            + crop.astype(np.float32) * (1.0 - blend_mask)
        )
        img[y0:y1, x0:x1] = blended.astype(np.uint8)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv.imwrite(str(out), img)
    print(f"[Lumina] Inpainted image saved: {out}")
    return str(out)
