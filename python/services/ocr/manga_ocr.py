"""manga-ocr (mayocream/manga-ocr-onnx) — Japanese text recognition.

Runs via onnxruntime, no PyTorch. Encoder runs once per crop, decoder
greedy-decodes until SEP. Model files live in <models>/manga-ocr-onnx/.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from .base import BaseOcrModel

if TYPE_CHECKING:
    from onnxruntime import InferenceSession

MODEL_ID = "mayocream/manga-ocr-onnx"
REQUIRED_FILES = ["encoder_model.onnx", "decoder_model.onnx", "vocab.txt"]
DOWNLOAD_FILES = REQUIRED_FILES + [
    "preprocessor_config.json",
    "config.json",
    "generation_config.json",
    "special_tokens_map.json",
    "tokenizer_config.json",
]

INPUT_SIZE = 224
MAX_TOKENS = 300
CLS_ID, SEP_ID, PAD_ID = 2, 3, 0


def _models_dir() -> Path:
    return Path(
        os.environ.get(
            "LUMINA_MODEL_DIR", Path(__file__).resolve().parents[3] / "models"
        )
    )


class MangaOcrModel(BaseOcrModel):
    """manga-ocr Japanese text recognition via ONNX Runtime (seq2seq)."""

    name = "manga-ocr (ONNX)"

    model_id = MODEL_ID
    model_dir = _models_dir() / "manga-ocr-onnx"

    def __init__(self) -> None:
        self._enc: Optional[InferenceSession] = None
        self._dec: Optional[InferenceSession] = None
        self._vocab: list[str] = []

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
        for i, f in enumerate(DOWNLOAD_FILES):
            dest = self.model_dir / f
            if dest.is_file():
                continue
            req = urllib.request.Request(
                base_url + f, headers={"User-Agent": "Lumina/0.1"}
            )
            with urllib.request.urlopen(req) as resp, open(
                dest.with_suffix(dest.suffix + ".part"), "wb"
            ) as out:
                total = int(resp.headers.get("Content-Length", -1))
                downloaded = 0
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback and total > 0:
                        done = sum(
                            (self.model_dir / x).stat().st_size
                            for x in DOWNLOAD_FILES[:i]
                            if (self.model_dir / x).is_file()
                        ) + downloaded
                        progress_callback(int(done * 100 / total), int(done), int(total))
            dest.with_suffix(dest.suffix + ".part").rename(dest)

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
        # Encoder = one forward pass → GPU. Decoder is autoregressive
        # (300 tiny sequential calls) → CPU (DirectML launch overhead).
        self._enc = create_session(
            self.model_dir / "encoder_model.onnx", sess_options=so
        )
        self._dec = create_session(
            self.model_dir / "decoder_model.onnx", prefer="cpu", sess_options=so
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
            log.debug(
                f"OCR box {i + 1}/{len(boxes)}: {text!r}"
                .encode("ascii", "replace")
                .decode("ascii")
            )

        return texts
