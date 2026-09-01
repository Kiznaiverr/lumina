"""manga-ocr (mayocream/manga-ocr-onnx) — Japanese text recognition.

Encoder runs once per crop (GPU), decoder greedy-decodes until SEP (CPU).
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from .config import (
    CLS_ID,
    DOWNLOAD_FILES,
    INPUT_SIZE,
    MAX_TOKENS,
    MODEL_DIR_NAME,
    MODEL_ID,
    PAD_ID,
    PREFER_DEC,
    PREFER_ENC,
    REQUIRED_FILES,
    SEP_ID,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


class MangaOcrModel(BaseOcrModel):
    name = "manga-ocr (ONNX)"
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES

    def __init__(self) -> None:
        self._enc: Optional[InferenceSession] = None
        self._dec: Optional[InferenceSession] = None
        self._vocab: list[str] = []

    def unload(self) -> None:
        """Release encoder + decoder sessions (frees VRAM/RAM)."""
        self._enc = None
        self._dec = None

    def _load(self) -> None:
        if self._enc is not None:
            return
        from utils.runtime import create_session, make_session_options

        so = make_session_options()
        log.info("Loading manga-ocr ONNX...")
        # Encoder = one forward pass -> GPU. Decoder is autoregressive
        # (300 tiny sequential calls) -> CPU (DirectML launch overhead).
        self._enc = create_session(
            self.model_dir / "encoder_model.onnx",
            prefer=PREFER_ENC,
            sess_options=so,
        )
        self._dec = create_session(
            self.model_dir / "decoder_model.onnx",
            prefer=PREFER_DEC,
            sess_options=so,
        )
        self._vocab = (
            (self.model_dir / "vocab.txt").read_text(encoding="utf-8").splitlines()
        )
        log.info("manga-ocr ready")

    def _preprocess(self, crop):
        from PIL import Image

        img = crop.convert("L").convert("RGB")
        img = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
        x = np.asarray(img, dtype=np.float32) / 255.0
        x = (x - 0.5) / 0.5
        return x.transpose(2, 0, 1)[np.newaxis]

    def _decode(self, hidden) -> str:
        dec = self._dec
        assert dec is not None
        ids = [CLS_ID]
        for _ in range(MAX_TOKENS):
            feed = {}
            for inp in dec.get_inputs():
                name = inp.name
                if name == "input_ids":
                    feed[name] = np.array([ids], dtype=np.int64)
                elif "hidden" in name.lower() or "encoder_output" in name.lower():
                    feed[name] = hidden
                elif "mask" in name.lower():
                    feed[name] = np.ones((1, hidden.shape[1]), dtype=np.int64)
            logits = np.asarray(dec.run(None, feed)[0])
            next_id = int(logits[0, -1].argmax())
            if next_id in (SEP_ID, PAD_ID):
                break
            ids.append(next_id)
        special = {"[CLS]", "[SEP]", "[PAD]", "[MASK]", "[UNK]"}
        return "".join(
            self._vocab[i]
            for i in ids[1:]
            if i < len(self._vocab) and self._vocab[i] not in special
        ).replace("##", "")

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        from PIL import Image

        self._load()
        enc = self._enc
        assert enc is not None
        img = Image.open(image_path).convert("RGB")

        texts: list[str] = []
        for i, b in enumerate(boxes):
            x0 = max(0, int(b["x"]))
            y0 = max(0, int(b["y"]))
            x1 = min(img.width, x0 + max(1, int(b["w"])))
            y1 = min(img.height, y0 + max(1, int(b["h"])))
            crop = img.crop((x0, y0, x1, y1))
            pixel_values = self._preprocess(crop)
            hidden = np.asarray(enc.run(None, {"pixel_values": pixel_values})[0])
            text = self._decode(hidden)
            texts.append(text)
            log.debug(f"OCR box {i + 1}/{len(boxes)}: {text!r}")

        return texts
