"""PP-OCRv6 medium rec — multilingual text recognition (CTC, one pass).

The character dictionary lives in inference.yml, so the download is just
the two inference files.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from .config import (
    DOWNLOAD_FILES,
    MAX_IMG_W,
    MODEL_DIR_NAME,
    MODEL_ID,
    REC_IMAGE_SHAPE,
    REQUIRED_FILES,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


class PPOcrV6Model(BaseOcrModel):
    name = "PP-OCRv6 (Paddle)"
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES

    def __init__(self) -> None:
        self._session: Optional[InferenceSession] = None
        self._chars: list[str] = []

    def unload(self) -> None:
        """Release the ONNX session (frees VRAM/RAM). Next call reloads."""
        self._session = None

    def _load(self) -> None:
        if self._session is not None:
            return
        from utils.runtime import create_session, make_session_options

        import yaml

        log.info("Loading PP-OCRv6 ONNX...")
        self._session = create_session(
            self.model_dir / "inference.onnx", sess_options=make_session_options()
        )
        cfg = yaml.safe_load(
            (self.model_dir / "inference.yml").read_text(encoding="utf-8")
        )
        chars = list(cfg["PostProcess"]["character_dict"])
        self._chars = ["blank"] + chars + [" "]  # idx 0 = CTC blank, last = space
        log.info(f"PP-OCRv6 ready ({len(chars)} chars)")

    @staticmethod
    def _to_bgr(crop) -> np.ndarray:
        """PIL RGB crop -> BGR ndarray (the model was trained on BGR)."""
        return np.asarray(crop)[:, :, ::-1]

    @staticmethod
    def _split_lines(img: np.ndarray) -> tuple[list[np.ndarray], bool]:
        """Split a bubble crop into line-level crops for recognition.

        PP-OCRv6 is line-level; a whole bubble (multi-line/column) fails.
        Vertical crops are rotated 90° CCW (columns read right-to-left, so
        the rightmost column lands on top). Lines are found by grouping
        character boxes that overlap in y — robust to columns only ~1px
        apart, where projection-based banding fails.

        Returns (lines, vertical): line crops in reading order and whether
        the bubble was vertical. Callers join vertical columns without
        newline (one logical line), horizontal lines with "\n".
        """
        import cv2

        h, w = img.shape[:2]
        vertical = h > w
        if vertical:
            img = np.rot90(img)  # CCW
        h, w = img.shape[:2]

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, bin_ = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
        contours, _ = cv2.findContours(
            bin_, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        min_area = max(9, (w * h) * 0.0002)
        boxes: list[tuple[int, int, int, int]] = []
        for cnt in contours:
            x, y, bw, bh = cv2.boundingRect(cnt)
            if bw < 6 or bh < 6 or bw * bh < min_area:
                continue
            boxes.append((x, y, x + bw, y + bh))

        # Join a box to a group when >=60% of its height overlaps the group;
        # plain any-overlap chains separate lines via thin crossings.
        boxes.sort(key=lambda b: b[1])
        groups: list[list[tuple[int, int, int, int]]] = []
        for b in boxes:
            for g in groups:
                g_y0 = min(bx[1] for bx in g)
                g_y1 = max(bx[3] for bx in g)
                overlap = min(b[3], g_y1) - max(b[1], g_y0)
                if overlap / (b[3] - b[1]) >= 0.6:
                    g.append(b)
                    break
            else:
                groups.append([b])

        lines: list[np.ndarray] = []
        for g in sorted(groups, key=lambda g: min(b[1] for b in g)):
            x0 = max(0, min(b[0] for b in g) - 4)
            x1 = min(w, max(b[2] for b in g) + 4)
            y0 = max(0, min(b[1] for b in g) - 4)
            y1 = min(h, max(b[3] for b in g) + 4)
            lines.append(img[y0:y1, x0:x1])
        return (lines or [img]), vertical

    @staticmethod
    def _preprocess(img: np.ndarray) -> np.ndarray:
        """Mirror PaddleX RecResizeImg -> [3, 48, W] float32 in [-1, 1].

        Vertical crops (h > w) are rotated 90° CCW first: the model is
        horizontal-only, and CCW rotation maps Japanese vertical reading
        order (columns right-to-left, chars top-to-bottom) to LTR.
        """
        import cv2

        img_c, img_h, base_img_w = REC_IMAGE_SHAPE
        h, w = img.shape[:2]
        if h > w:
            img = np.rot90(img)  # CCW
            h, w = w, h
        max_wh_ratio = max(base_img_w / img_h, w / h)
        img_w = int(img_h * max_wh_ratio)
        if img_w > MAX_IMG_W:
            img_w = MAX_IMG_W
            resized_w = MAX_IMG_W
        else:
            ratio = w / float(h)
            if math.ceil(img_h * ratio) > img_w:
                resized_w = img_w
            else:
                resized_w = int(math.ceil(img_h * ratio))
        resized = cv2.resize(img, (resized_w, img_h))
        resized = resized.astype("float32").transpose((2, 0, 1)) / 255
        resized -= 0.5
        resized /= 0.5
        out = np.zeros((img_c, img_h, img_w), dtype=np.float32)
        out[:, :, :resized_w] = resized
        return out

    def _decode(self, pred: np.ndarray) -> tuple[str, float]:
        """CTC greedy decode: argmax -> collapse repeats -> drop blank."""
        idx = pred.argmax(axis=-1)
        prob = pred.max(axis=-1)
        keep = np.ones(len(idx), dtype=bool)
        keep[1:] = idx[1:] != idx[:-1]
        keep &= idx != 0  # index 0 is the CTC blank
        chars = [self._chars[i] for i in idx[keep]]
        score = float(prob[keep].mean()) if keep.any() else 0.0
        return "".join(chars), score

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        from PIL import Image

        self._load()
        sess = self._session
        assert sess is not None
        input_name = sess.get_inputs()[0].name
        img = Image.open(image_path).convert("RGB")

        texts: list[str] = []
        for i, b in enumerate(boxes):
            x0 = max(0, int(b["x"]))
            y0 = max(0, int(b["y"]))
            x1 = min(img.width, x0 + max(1, int(b["w"])))
            y1 = min(img.height, y0 + max(1, int(b["h"])))
            crop = img.crop((x0, y0, x1, y1))
            lines, vertical = self._split_lines(self._to_bgr(crop))
            parts: list[str] = []
            for line in lines:
                tensor = self._preprocess(line)[None]
                out = np.asarray(sess.run(None, {input_name: tensor})[0])
                text, score = self._decode(out[0])
                lh, lw = line.shape[:2]
                # Drop low-confidence or tiny rows (bubble borders/tails).
                if not text or score < 0.3 or (lh < 24 and lh * lw < 550):
                    continue
                parts.append(text)
                log.debug(f"OCR box {i + 1}/{len(boxes)} ({score:.2f}): {text!r}")
            # Vertical columns read right-to-left as one logical line.
            texts.append("".join(parts) if vertical else "\n".join(parts))

        return texts
