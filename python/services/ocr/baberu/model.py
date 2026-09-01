"""Baberu OCR — multilingual (ja/zh/en) manga bubble recognition.

115M vision-to-text model (DINOv2 encoder + causal decoder) shipped as
three ONNX graphs (vision, prefill, step w/ KV cache). Char-level vocab
(14,630 symbols) keeps SFX and full/half-width mixing intact.
"""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from .config import (
    DOWNLOAD_FILES,
    INPUT_SIZE,
    MAX_CONTENT_RUN,
    MAX_NEW_TOKENS,
    MODEL_DIR_NAME,
    MODEL_ID,
    PREFER_PREFILL,
    PREFER_STEP,
    PREFER_VISION,
    REPETITION_PENALTY,
    REQUIRED_FILES,
    VISION_FILE,
    _MEAN,
    _PAST,
    _STD,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


class _Vocab:
    """Char-level vocab: ids 0..3 = <pad>/<bos>/<eos>/<unk>; id>=4 -> charset[id-4]."""

    def __init__(self, vocab_json: Path) -> None:
        charset = json.loads(vocab_json.read_text(encoding="utf-8"))
        self.id2ch = {0: "", 1: "", 2: "", 3: ""}
        for i, ch in enumerate(charset):
            self.id2ch[i + 4] = ch
        self.bos, self.eos = 1, 2
        self.content_ids = {
            i + 4
            for i, ch in enumerate(charset)
            if len(ch) == 1
            and ch not in "ーｰ〜~"
            and unicodedata.category(ch)[0] in "LN"
        }

    def decode(self, ids) -> str:
        return "".join(self.id2ch.get(i, "") for i in ids if i >= 4)


class BaberuOcrModel(BaseOcrModel):
    name = "Baberu OCR"
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES

    def __init__(self) -> None:
        self._vis: Optional[InferenceSession] = None
        self._pre: Optional[InferenceSession] = None
        self._stp: Optional[InferenceSession] = None
        self._vocab: Optional[_Vocab] = None

    def unload(self) -> None:
        """Release all ONNX sessions (frees VRAM/RAM). Next call reloads."""
        self._vis = None
        self._pre = None
        self._stp = None

    def _load(self) -> None:
        if self._vis is not None:
            return
        from utils.runtime import create_session, make_session_options

        so = make_session_options()
        log.info("Loading Baberu OCR ONNX...")
        # Vision = one forward pass -> GPU. Decoder prefill/step are
        # autoregressive (many tiny sequential calls) -> CPU (DirectML
        # launch overhead would outweigh any speedup there).
        self._vis = create_session(
            self.model_dir / VISION_FILE, prefer=PREFER_VISION, sess_options=so
        )
        self._pre = create_session(
            self.model_dir / "onnx/decoder_prefill_int8.onnx",
            prefer=PREFER_PREFILL,
            sess_options=so,
        )
        self._stp = create_session(
            self.model_dir / "onnx/decoder_step_int8.onnx",
            prefer=PREFER_STEP,
            sess_options=so,
        )
        self._vocab = _Vocab(self.model_dir / "tokenizer/vocab.json")
        log.info("Baberu OCR ready")

    @staticmethod
    def _preprocess(crop) -> np.ndarray:
        from PIL import Image

        img = crop.convert("RGB").resize(
            (INPUT_SIZE, INPUT_SIZE), Image.Resampling.BICUBIC
        )
        x = (np.asarray(img, np.float32) / 255.0 - _MEAN) / _STD
        return x.transpose(2, 0, 1)[np.newaxis]  # [1,3,224,224]

    def _decode(self, vision_embeds: np.ndarray) -> str:
        """Greedy decode with KV cache: prefill -> step loop -> decode."""
        v = self._vocab
        assert v is not None and self._pre is not None and self._stp is not None
        out = self._pre.run(
            None,
            {
                "vision_embeds": vision_embeds,
                "input_ids": np.array([[v.bos]], np.int64),
            },
        )
        logits = np.asarray(out[0])[0, -1].astype(np.float64)
        present = [np.asarray(t) for t in out[1:]]
        seq, toks, pos = [v.bos], [], vision_embeds.shape[1] + 1
        for _ in range(MAX_NEW_TOKENS):
            if REPETITION_PENALTY != 1.0:
                for tid in set(seq):
                    s = logits[tid]
                    logits[tid] = (
                        s * REPETITION_PENALTY if s < 0 else s / REPETITION_PENALTY
                    )
            if MAX_CONTENT_RUN and toks and toks[-1] in v.content_ids:
                last, run = toks[-1], 0
                for t in reversed(toks):
                    if t == last:
                        run += 1
                    else:
                        break
                if run >= MAX_CONTENT_RUN:
                    logits[last] = -np.inf
            nxt = int(np.argmax(logits))
            if nxt == v.eos:
                break
            toks.append(nxt)
            seq.append(nxt)
            if len(toks) >= MAX_NEW_TOKENS:
                break
            feed = {
                "input_ids": np.array([[nxt]], np.int64),
                "position_ids": np.array([[pos]], np.int64),
            }
            feed.update({nm: t for nm, t in zip(_PAST, present)})
            out = self._stp.run(None, feed)
            logits = np.asarray(out[0])[0, -1].astype(np.float64)
            present = [np.asarray(t) for t in out[1:]]
            pos += 1
        return v.decode(toks)

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        from PIL import Image

        self._load()
        vis = self._vis
        assert vis is not None
        img = Image.open(image_path).convert("RGB")

        texts: list[str] = []
        for i, b in enumerate(boxes):
            x0 = max(0, int(b["x"]))
            y0 = max(0, int(b["y"]))
            x1 = min(img.width, x0 + max(1, int(b["w"])))
            y1 = min(img.height, y0 + max(1, int(b["h"])))
            crop = img.crop((x0, y0, x1, y1))
            embeds = np.asarray(
                vis.run(["vision_embeds"], {"pixel_values": self._preprocess(crop)})[0]
            )
            text = self._decode(embeds)
            texts.append(text)
            log.debug(f"OCR box {i + 1}/{len(boxes)}: {text!r}")

        return texts
