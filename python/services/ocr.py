"""OCR service — manga-ocr ONNX (mayocream/manga-ocr-onnx).

Runs via onnxruntime, no PyTorch. Encoder runs once per crop, decoder
greedy-decodes until SEP. Model files live in <models>/manga-ocr-onnx/.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from utils.logger import log

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

_MODELS_DIR = Path(
    os.environ.get("LUMINA_MODEL_DIR", Path(__file__).resolve().parents[2] / "models")
)
MODEL_DIR = _MODELS_DIR / "manga-ocr-onnx"

INPUT_SIZE = 224
MAX_TOKENS = 300
CLS_ID, SEP_ID, PAD_ID = 2, 3, 0

_enc: InferenceSession | None = None
_dec: InferenceSession | None = None
_vocab: list[str] = []


def is_model_ready() -> bool:
    return all((MODEL_DIR / f).is_file() for f in REQUIRED_FILES)


def get_model_info() -> dict:
    """Model metadata for the settings → Models manager."""
    ready = is_model_ready()
    size = (
        sum(
            (MODEL_DIR / f).stat().st_size
            for f in REQUIRED_FILES
            if (MODEL_DIR / f).is_file()
        )
        if ready
        else None
    )
    return {
        "id": "ocr",
        "name": "manga-ocr (ONNX)",
        "kind": "ocr",
        "ready": ready,
        "size": size,
        "description": (
            "manga-ocr — Japanese text recognition trained on manga, "
            "handles vertical, horizontal, and stylized typesetting."
        ),
    }


def download_model(progress_callback=None) -> None:
    import urllib.request

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    base_url = f"https://huggingface.co/{MODEL_ID}/resolve/main/"

    log.info(f"Downloading OCR model {MODEL_ID} ...")
    for i, f in enumerate(DOWNLOAD_FILES):
        dest = MODEL_DIR / f
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
                        (MODEL_DIR / x).stat().st_size
                        for x in DOWNLOAD_FILES[:i]
                        if (MODEL_DIR / x).is_file()
                    ) + downloaded
                    progress_callback(int(done * 100 / total), int(done), int(total))
        dest.with_suffix(dest.suffix + ".part").rename(dest)
    log.info("OCR model ready")


def _load():
    global _enc, _dec, _vocab
    if _enc is not None:
        return
    import onnxruntime as ort

    log.info("Loading manga-ocr ONNX...")
    _enc = ort.InferenceSession(str(MODEL_DIR / "encoder_model.onnx"))
    _dec = ort.InferenceSession(str(MODEL_DIR / "decoder_model.onnx"))
    _vocab = (MODEL_DIR / "vocab.txt").read_text(encoding="utf-8").splitlines()
    log.info("manga-ocr ready")


def _preprocess(crop):
    from PIL import Image

    img = crop.convert("L").convert("RGB")
    img = img.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - 0.5) / 0.5
    return x.transpose(2, 0, 1)[np.newaxis]


def _decode(hidden) -> str:
    dec = _dec
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
        _vocab[i]
        for i in ids[1:]
        if i < len(_vocab) and _vocab[i] not in special
    ).replace("##", "")


def ocr_boxes(image_path: str, boxes: list[dict]) -> list[str]:
    from PIL import Image

    _load()
    enc = _enc
    assert enc is not None
    img = Image.open(image_path).convert("RGB")

    texts: list[str] = []
    for i, b in enumerate(boxes):
        x0 = max(0, int(b["x"]))
        y0 = max(0, int(b["y"]))
        x1 = min(img.width, x0 + max(1, int(b["w"])))
        y1 = min(img.height, y0 + max(1, int(b["h"])))
        crop = img.crop((x0, y0, x1, y1))
        pixel_values = _preprocess(crop)
        hidden = np.asarray(enc.run(None, {"pixel_values": pixel_values})[0])
        text = _decode(hidden)
        texts.append(text)
        log.debug(
            f"OCR box {i + 1}/{len(boxes)}: {text!r}".encode("ascii", "replace").decode("ascii")
        )

    return texts
