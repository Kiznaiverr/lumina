"""PP-OCRv6 medium rec (PaddlePaddle) — multilingual text recognition.

CTC recognizer (single forward pass). The character dictionary is embedded
in ``inference.yml``, so the download is just the two inference files.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from .base import BaseOcrModel

if TYPE_CHECKING:
    from onnxruntime import InferenceSession

MODEL_ID = "PaddlePaddle/PP-OCRv6_medium_rec_onnx"
REQUIRED_FILES = ["inference.onnx", "inference.yml"]
DOWNLOAD_FILES = REQUIRED_FILES

REC_IMAGE_SHAPE = (3, 48, 320)  # C, H, base W (PaddleX default)
MAX_IMG_W = 3200


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


class PPOcrV6Model(BaseOcrModel):
    """PP-OCRv6 medium recognition model via ONNX Runtime (CTC)."""

    name = "PP-OCRv6 (Paddle)"

    model_id = MODEL_ID
    model_dir = _models_dir() / "ppocrv6"

    def __init__(self) -> None:
        self._session: Optional[InferenceSession] = None
        self._chars: list[str] = []

    def is_ready(self) -> bool:
        return all((self.model_dir / f).is_file() for f in REQUIRED_FILES)

    def size(self) -> Optional[int]:
        if not self.is_ready():
            return None
        return sum(
            (self.model_dir / f).stat().st_size
            for f in REQUIRED_FILES
            if (self.model_dir / f).is_file()
        )

    def download(self, progress_callback=None) -> None:
        import urllib.request

        self.model_dir.mkdir(parents=True, exist_ok=True)
        base_url = f"https://huggingface.co/{self.model_id}/resolve/main/"

        log.info(f"Downloading OCR model {self.model_id} ...")
        # Files still missing (already-downloaded ones are skipped).
        pending = [f for f in DOWNLOAD_FILES if not (self.model_dir / f).is_file()]

        # Grand total = sum of Content-Length of every pending file (HEAD is
        # cheap). Without it, progress would compare cumulative bytes against
        # the current file's size only → overshoots 100% on multi-file models.
        # ?download=true also forces HF to serve real xet blobs, not pointers.
        grand_total = 0
        sizes: dict[str, int] = {}
        for f in pending:
            try:
                req = urllib.request.Request(
                    base_url + f + "?download=true",
                    method="HEAD",
                    headers={"User-Agent": "Lumina/0.1"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    sizes[f] = int(resp.headers.get("Content-Length", -1))
            except Exception:
                sizes[f] = -1
            if sizes[f] > 0:
                grand_total += sizes[f]

        done = 0
        for f in pending:
            dest = self.model_dir / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            req = urllib.request.Request(
                base_url + f + "?download=true", headers={"User-Agent": "Lumina/0.1"}
            )
            with urllib.request.urlopen(req) as resp, open(
                dest.with_suffix(dest.suffix + ".part"), "wb"
            ) as out:
                total = int(resp.headers.get("Content-Length", -1))
                if total > 0 and sizes.get(f, -1) <= 0:
                    grand_total += total  # size discovered late
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    done += len(chunk)
                    if progress_callback and grand_total > 0:
                        progress_callback(
                            int(done * 100 / grand_total), done, grand_total
                        )
            dest.with_suffix(dest.suffix + ".part").rename(dest)

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

        Returns ``(lines, vertical)``: line crops in reading order, and
        whether the bubble was vertical. Callers join vertical columns
        without newline (one logical line), horizontal lines with.
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
        """Mirror PaddleX RecResizeImg for one crop -> [3, 48, W] float32 in [-1, 1].

        Vertical crops (h > w) are rotated 90° CCW first: the model is
        horizontal-only, and CCW rotation maps Japanese vertical reading
        order (columns right-to-left, chars top-to-bottom) to left-to-right.
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
                if (
                    not text
                    or score < 0.3
                    or (lh < 24 and lh * lw < 550)
                ):
                    continue
                parts.append(text)
                log.debug(
                    f"OCR box {i + 1}/{len(boxes)} ({score:.2f}): {text!r}"
                )
            # Vertical columns read right-to-left as one logical line.
            texts.append("".join(parts) if vertical else "\n".join(parts))

        return texts
