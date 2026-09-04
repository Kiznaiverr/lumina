"""AngleNet — lightweight manga text-rotation model (Kellenok/anglenet).

A global companion model that is auto-downloaded in the background (and
surfaces in /model/check as kind "aux"). Its only remaining job is the
``textAngle`` slant for translated layers — the /detect pipeline stores
``lean_deg()`` per crop, and typesetting rotates translated text to match
the original. It is NOT used by any OCR model anymore.

Model: models/anglenet/anglenet_v0_1_distill_64x64.onnx.
All functions return None when the file is missing — graceful fallback.
"""
from __future__ import annotations

import math
import urllib.request
from pathlib import Path
from typing import Callable, Optional, Tuple

import cv2
import numpy as np

from utils.logger import log
from utils.download import DownloadCancelled, is_cancelled

REPO_ID = "Kellenok/anglenet"
MODEL_DIR_NAME = "anglenet"
_ANGLE_FILE = "anglenet_v0_1_distill_64x64.onnx"

_session = None
_tried = False

_MIN_SIDE = 4  # px — skip crops smaller than this (nothing to measure)


def model_path(models_dir: Optional[Path] = None) -> Path:
    """Path of the AngleNet onnx (models/anglenet/)."""
    root = models_dir or Path(__file__).resolve().parents[2] / "models"
    return root / MODEL_DIR_NAME / _ANGLE_FILE


def model_dir(models_dir: Optional[Path] = None) -> Path:
    root = models_dir or Path(__file__).resolve().parents[2] / "models"
    return root / MODEL_DIR_NAME


def is_ready(models_dir: Optional[Path] = None) -> bool:
    return model_path(models_dir).is_file()


def size(models_dir: Optional[Path] = None) -> Optional[int]:
    p = model_path(models_dir)
    return p.stat().st_size if p.is_file() else None


def download(
    progress_callback: Optional[Callable[[int, int, int], None]] = None,
    models_dir: Optional[Path] = None,
) -> None:
    """Fetch the ONNX from its HF repo (same mechanism as OCR models).

    A ``.part`` file is written first and renamed on success, so an
    interrupted download never leaves a half-written onnx behind. Progress
    is reported as (percent, done_bytes, total_bytes) when known.
    """
    dest = model_path(models_dir)
    if dest.is_file():
        log.info(f"AngleNet already present: {dest}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/{REPO_ID}/resolve/main/{_ANGLE_FILE}?download=true"
    part = dest.with_suffix(dest.suffix + ".part")
    total = -1
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Lumina/0.1"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            total = int(resp.headers.get("Content-Length", -1))
    except Exception:
        total = -1
    log.info(f"Downloading AngleNet {_ANGLE_FILE} ...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Lumina/0.1"})
        with urllib.request.urlopen(req) as resp, open(part, "wb") as out:
            done = 0
            while True:
                if is_cancelled():
                    raise DownloadCancelled()
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if progress_callback and total > 0:
                    progress_callback(int(done * 100 / total), done, total)
    except DownloadCancelled:
        part.unlink(missing_ok=True)
        log.info("AngleNet download cancelled - removed .part file")
        raise
    except Exception:
        part.unlink(missing_ok=True)
        raise
    part.rename(dest)
    log.info(f"AngleNet download complete: {dest}")


def _load(models_dir: Optional[Path] = None):
    """Lazy session load; returns None (and warns once) if the file is
    missing so callers can fall back to PCA slant."""
    global _session, _tried
    if _session is not None or _tried:
        return _session
    _tried = True
    path = model_path(models_dir)
    if not path.is_file():
        log.warn(
            f"AngleNet not found at {path} - textAngle falls back to PCA"
        )
        return None
    try:
        from utils.runtime import create_session, make_session_options

        _session = create_session(
            path, prefer="cpu", sess_options=make_session_options()
        )
        log.info(f"AngleNet ready ({path.name})")
    except Exception:
        import traceback

        log.error(f"AngleNet failed to load: {traceback.format_exc()}")
        _session = None
    return _session


def unload() -> None:
    """Release the session (frees RAM). Reloads on next use."""
    global _session, _tried
    _session = None
    _tried = False


def _letterbox(crop_gray: np.ndarray, target_size: int = 64) -> np.ndarray:
    """Center a crop into a target_size² float tensor, aspect-preserving."""
    h, w = crop_gray.shape[:2]
    scale = min(target_size / max(1, w), target_size / max(1, h))
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = cv2.resize(crop_gray, (nw, nh), interpolation=cv2.INTER_AREA)
    pad = np.zeros((target_size, target_size), dtype=np.uint8)
    y0 = (target_size - nh) // 2
    x0 = (target_size - nw) // 2
    pad[y0 : y0 + nh, x0 : x0 + nw] = resized
    return (pad.astype(np.float32) / 255.0)[None, None, :, :]


def _decode_angle(csl_logits: np.ndarray) -> float:
    """CSL continuous trigonometric decoding -> 0-180°."""
    probs = np.exp(csl_logits[0] - np.max(csl_logits[0]))
    probs /= np.sum(probs)
    bins = np.arange(180, dtype=np.float32)
    return (
        0.5
        * math.degrees(
            math.atan2(
                np.sum(probs * np.sin(np.radians(2.0 * bins))),
                np.sum(probs * np.cos(np.radians(2.0 * bins))),
            )
        )
    ) % 180.0


def _read_axis(pred_deg: float) -> Optional[bool]:
    """Reading axis from the predicted orientation: True = vertical
    (pred near 90°), False = horizontal (pred near 0°/180°), None when
    the prediction sits ~45°/135° and is ambiguous."""
    dist_v = abs(pred_deg - 90.0)
    dist_h = min(pred_deg, 180.0 - pred_deg)
    if abs(dist_v - dist_h) < 10.0:
        return None  # too close to call — don't risk a ~90° mistake
    return dist_v < dist_h


def _content_is_vertical(crop_bgr: np.ndarray) -> Optional[bool]:
    """Layout verdict from the axis-aligned crop content itself, using
    the same row-coverage heuristic as PP-OCRv6's split_lines. None when
    it can't be computed.

    Only used as a ONE-WAY check: AngleNet is unreliable on portrait
    multi-line crops (bubble-level boxes) and may claim vertical when the
    crop is actually stacked horizontal lines — rotating that destroys
    OCR. But on truly tilted text (pred ~0/180) the content heuristic is
    itself unreliable, so a horizontal verdict is always trusted.
    """
    try:
        from services.ocr.ppocrv6.preprocess import _looks_vertical

        return _looks_vertical(crop_bgr)
    except Exception:
        return None


def _rot_delta(pred_deg: float) -> Optional[float]:
    """Signed clockwise rotation that straightens the text; the lean angle
    is the negation of this. Branch (vertical vs horizontal) is read from
    the prediction itself, not the crop aspect, so bubble-level
    (near-square) crops work. None = ambiguous."""
    axis = _read_axis(pred_deg)
    if axis is None:
        return None
    if axis:  # vertical reading — upright column sits at 90°
        return pred_deg - 90.0
    # horizontal reading — 0° is left-to-right; clockwise tilt moves the
    # prediction toward 180°.
    return pred_deg if pred_deg <= 90.0 else pred_deg - 180.0


def predict(crop_bgr: np.ndarray) -> Tuple[Optional[float], Optional[bool]]:
    """Return ``(pred_deg, is_vert)`` for one crop, or (None, None) when
    the model is unavailable or the crop is too small. ``is_vert`` is the
    crop aspect (h >= w) — a layout hint, not the model verdict."""
    sess = _load()
    if sess is None:
        return None, None
    h, w = crop_bgr.shape[:2]
    if w < _MIN_SIDE or h < _MIN_SIDE:
        return None, None
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    # 10% context margin around the crop (same as the model card).
    pw, ph = int(w * 0.10), int(h * 0.10)
    ctx = np.pad(gray, ((ph, ph), (pw, pw)), mode="edge")
    tensor = _letterbox(ctx, 64)
    csl_logits, _tilt = sess.run(None, {"input": tensor})
    pred_deg = _decode_angle(csl_logits)
    return pred_deg, h >= w


def lean_deg(crop_bgr: np.ndarray) -> Optional[float]:
    """Signed text slant in [-45, 45]° (positive = clockwise lean), or
    None when the model can't be used. This is what /detect stores in
    ``textAngle``."""
    pred_deg, is_vert = predict(crop_bgr)
    if pred_deg is None or is_vert is None:
        log.debug("AngleNet lean_deg: unavailable - no textAngle")
        return None
    axis = _read_axis(pred_deg)
    if axis is None:
        log.debug(
            "AngleNet lean_deg: orientation ambiguous "
            f"(pred {pred_deg:.1f} deg) - no textAngle"
        )
        return None
    content = _content_is_vertical(crop_bgr)
    # One-way gate: only distrust a VERTICAL verdict that conflicts with
    # clearly horizontal content. A horizontal verdict (tilted text, the
    # model's home domain) is always trusted — the content heuristic is
    # unreliable on tilted crops and would wrongly veto real leans.
    if axis and content is not None and not content:
        log.debug(
            "AngleNet lean_deg: axis mismatch - content is horizontal "
            f"but model says vertical (pred {pred_deg:.1f} deg) - no textAngle"
        )
        return None
    rot_delta = _rot_delta(pred_deg)
    if rot_delta is None:
        log.debug(
            "AngleNet lean_deg: orientation ambiguous "
            f"(pred {pred_deg:.1f} deg) - no textAngle"
        )
        return None
    lean = -rot_delta
    if lean > 45:
        lean -= 90
    elif lean < -45:
        lean += 90
    if abs(lean) < 0.5:
        lean = 0.0
    lean = round(float(lean), 1)
    log.debug(
        f"AngleNet lean_deg: pred {pred_deg:.1f} deg -> textAngle {lean:+.1f} deg"
    )
    return lean
