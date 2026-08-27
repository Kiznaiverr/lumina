"""LaMa inpainting model (opencv/inpainting_lama) via ONNX Runtime.

Emits one RGBA patch PNG per input box:

  RGB = model output (inpainted pixels)
  A   = feathered mask (Gaussian-blurred text mask, 0..255)

The renderer composites each patch over the original page image at its bbox;
because the alpha channel *is* the feathered mask, the result is visually
identical to the old single cleaned-image output, but every region stays
independently toggleable, deletable, and opacity-adjustable.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np

from .base import BaseInpaintModel, ProgressCallback

MODEL_ID = "opencv/inpainting_lama"
MODEL_FILENAME = "inpainting_lama_2025jan.onnx"
MODEL_URL = f"https://huggingface.co/{MODEL_ID}/resolve/main/{MODEL_FILENAME}"

_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[4] / "models")
)
MODEL_PATH = _MODELS_DIR / MODEL_FILENAME

# Patch sets live in <repo>/cache
_CACHE_DIR = Path(
    os.environ.get("LUMINA_CACHE_DIR", Path(__file__).resolve().parents[4] / "cache")
)

INPUT_SIZE = 512
CONTEXT_PAD = 32
MASK_DILATE = 4

_session = None


class LamaModel(BaseInpaintModel):
    name = "lama"

    def is_ready(self) -> bool:
        return MODEL_PATH.is_file()

    def download(self, progress_callback: ProgressCallback = None) -> None:
        import urllib.request

        if self.is_ready():
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

    def _load_session(self):
        global _session
        if _session is None:
            import onnxruntime as ort

            if not self.is_ready():
                self.download()

            print(f"[Lumina] Loading inpaint ONNX model: {MODEL_PATH}")
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            _session = ort.InferenceSession(
                str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            print(
                f"[Lumina] Inpaint session ready (inputs: "
                f"{[(i.name, i.shape) for i in _session.get_inputs()]})"
            )
        return _session

    def inpaint(
        self,
        image_path: str,
        boxes: list[dict],
        output_dir: Optional[Path] = None,
    ) -> list[dict]:
        import cv2 as cv

        session = self._load_session()
        img = cv.imread(image_path)  # BGR
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        h, w = img.shape[:2]

        if output_dir is None:
            src = Path(image_path)
            import time

            stamp = time.strftime("%Y%m%d-%H%M%S")
            output_dir = _CACHE_DIR / f"{src.stem}_inpaint_{stamp}"
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        patches: list[dict] = []
        for i, box in enumerate(boxes):
            x0 = max(0, int(box["x"]) - CONTEXT_PAD)
            y0 = max(0, int(box["y"]) - CONTEXT_PAD)
            x1 = min(w, int(box["x"] + box["w"]) + CONTEXT_PAD)
            y1 = min(h, int(box["y"] + box["h"]) + CONTEXT_PAD)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue

            crop = img[y0:y1, x0:x1]
            ch, cw = crop.shape[:2]

            mask = self._build_text_mask(crop)

            image_blob = cv.dnn.blobFromImage(
                crop, 1.0 / 255.0, (INPUT_SIZE, INPUT_SIZE), (0, 0, 0), swapRB=False
            )
            mask_blob = cv.dnn.blobFromImage(
                mask, 1.0, (INPUT_SIZE, INPUT_SIZE), (0,), crop=False
            )
            mask_blob = (mask_blob > 0).astype(np.float32)

            feed: dict = {}
            for inp in session.get_inputs():
                if "mask" in inp.name.lower():
                    feed[inp.name] = mask_blob
                else:
                    feed[inp.name] = image_blob

            output = np.asarray(session.run(None, feed)[0])[0]  # CHW 0..255

            result = np.transpose(output, (1, 2, 0))
            result = np.clip(result, 0, 255).astype(np.uint8)
            result = cv.resize(result, (cw, ch), interpolation=cv.INTER_LINEAR)

            # Feathered mask → alpha channel (same blur as the old compositor)
            alpha = cv.GaussianBlur(mask, (0, 0), 2).astype(np.float32)
            alpha = np.clip(alpha, 0, 255).astype(np.uint8)

            patch = np.dstack([result, alpha])
            patch_path = output_dir / f"patch_{i:03d}.png"
            cv.imwrite(str(patch_path), patch)

            patches.append(
                {
                    "bbox": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
                    "imagePath": str(patch_path),
                }
            )

        print(f"[Lumina] Inpaint complete: {len(patches)} patch(es) -> {output_dir}")
        return patches

    @staticmethod
    def _build_text_mask(crop: np.ndarray) -> np.ndarray:
        import cv2 as cv

        gray = cv.cvtColor(crop, cv.COLOR_RGB2GRAY)
        _, mask = cv.threshold(gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
        kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (MASK_DILATE * 2 + 1,) * 2)
        mask = cv.dilate(mask, kernel)
        return mask
