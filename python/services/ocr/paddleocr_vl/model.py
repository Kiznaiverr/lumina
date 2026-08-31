"""PaddleOCR-VL 1.6 — vision-language OCR (NaViT vision + ERNIE decoder).

Recognizes whole regions of text at once (multi-language), so Lumina feeds
it region crops made of several detected boxes — see supports_regions /
ocr_regions. Three ONNX graphs: vision encoder (GPU), token embedding
table (CPU), KV-cache decoder (CPU).

Known int8 caveats (model card):
  - quality degrades on long sequences -> each region is capped to a few
    boxes and oversized crops are downscaled to <= MAX_PATCHES.
  - this int8 build is FASTER on CPU than on Intel Arc iGPU -> decoder CPU.

Prompt: <|begin_of_sentence|>User: <|IMAGE_START|>{placeholders}<|IMAGE_END|>OCR:\nAssistant:\n
with one <|IMAGE_PLACEHOLDER|> per merged (2x2) image patch.
"""
from __future__ import annotations

import json
import math
import re
from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from .config import (
    DOWNLOAD_FILES,
    MAX_NEW_TOKENS,
    MAX_PATCHES,
    MODEL_DIR_NAME,
    MODEL_ID,
    REQUIRED_FILES,
    _EOS_FALLBACK,
    _PATCH,
    _PLACEHOLDER_ID,
    _PREFIX,
    _SUFFIX,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


def _tensor_dtype(inp) -> np.dtype:
    t = getattr(inp, "type", "")  # e.g. "tensor(float16)"
    return {
        "tensor(float)": np.float32,
        "tensor(float16)": np.float16,
        "tensor(double)": np.float64,
        "tensor(int64)": np.int64,
        "tensor(int32)": np.int32,
        "tensor(int16)": np.int16,
        "tensor(int8)": np.int8,
        "tensor(uint8)": np.uint8,
        "tensor(bool)": np.bool_,
    }.get(t, np.float32)


class PaddleOcrVlModel(BaseOcrModel):
    name = "PaddleOCR-VL 1.6 (ONNX)"
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES

    def __init__(self) -> None:
        self._vis: Optional[InferenceSession] = None
        self._dec: Optional[InferenceSession] = None
        self._emb: Optional[InferenceSession] = None
        self._tok = None
        self._prefix_ids: list[int] = []
        self._suffix_ids: list[int] = []
        self._ph_id = _PLACEHOLDER_ID
        self._eos = _EOS_FALLBACK
        self._min_pixels = 112896
        self._max_pixels = 0
        self._mean = (0.5, 0.5, 0.5)
        self._std = (0.5, 0.5, 0.5)
        self._vis_dtype = np.float32
        self._grid_dtype = np.int64
        self._emb_dtype = np.float32
        self._mask_dtype = np.int64
        self._kv_dtype = np.float32
        self._past_names: list[str] = []
        self._kv_zero_shape = (1, 2, 0, 128)
        self._dec_out_names: list[str] = []
        self._logits_name = "logits"
        self._kv_feed: dict[str, str] = {}  # input name -> output name

    def unload(self) -> None:
        """Release all ONNX sessions + tokenizer (frees VRAM/RAM)."""
        self._vis = None
        self._dec = None
        self._emb = None
        self._tok = None

    def _load(self) -> None:
        if self._vis is not None:
            return
        try:
            from tokenizers import Tokenizer as _Tk
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "PaddleOCR-VL needs the 'tokenizers' package — run: pip install tokenizers"
            ) from e
        from utils.runtime import create_session, make_session_options

        so = make_session_options()
        log.info("Loading PaddleOCR-VL ONNX (this takes a moment)...")
        # The exported NaViT graph has identity Reshape nodes (empty shape
        # tensor) whose DML kernel fails with ERROR_INVALID_PARAMETER on
        # EVERY adapter (AMD iGPU and NVIDIA alike — verified), so these
        # graphs must run on CPU. With the CUDA wheel installed,
        # prefer_no_dml() returns "auto" -> CUDA EP instead.
        from utils.runtime import prefer_no_dml

        vis = create_session(
            self.model_dir / "onnx/vision_encoder_q8.onnx",
            prefer=prefer_no_dml(),
            sess_options=so,
        )
        dec = create_session(
            self.model_dir / "onnx/decoder_q8.onnx",
            prefer=prefer_no_dml(),
            sess_options=so,
        )
        # Embedding stays CPU: a 404MB token-lookup table read per token —
        # GPU transfer would cost more than the CPU lookup itself.
        emb = create_session(
            self.model_dir / "onnx/embedding.onnx",
            prefer="cpu",
            sess_options=so,
        )
        tok = _Tk.from_file(str(self.model_dir / "tokenizer.json"))

        cfg = json.loads(
            (self.model_dir / "preprocessor_config.json").read_text(encoding="utf-8")
        )
        self._min_pixels = int(cfg.get("min_pixels", self._min_pixels))
        self._max_pixels = int(cfg.get("max_pixels") or 0)
        mean = cfg.get("image_mean") or cfg.get("mean")
        std = cfg.get("image_std") or cfg.get("std")
        if mean and len(mean) == 3:
            self._mean = tuple(float(v) for v in mean)
        if std and len(std) == 3:
            self._std = tuple(float(v) for v in std)

        self._ph_id = tok.token_to_id("<|IMAGE_PLACEHOLDER|>") or _PLACEHOLDER_ID
        eos = tok.token_to_id("<|end_of_sentence|>")
        if eos is None:  # scan added vocabulary for the eos marker
            for name, tid in tok.get_added_vocabulary().items():
                if "end_of_sentence" in name or "eos" in name.lower():
                    eos = tid
                    break
        self._eos = eos or _EOS_FALLBACK
        self._prefix_ids = tok.encode(_PREFIX).ids
        self._suffix_ids = tok.encode(_SUFFIX).ids
        log.debug(
            f"PaddleOCR-VL prompt: prefix={len(self._prefix_ids)} suffix="
            f"{len(self._suffix_ids)} placeholder={self._ph_id} eos={self._eos}"
        )

        # dtypes from the actual graphs
        vis_inputs = {i.name: i for i in vis.get_inputs()}
        pv = vis_inputs.get("pixel_values") or vis.get_inputs()[0]
        self._vis_dtype = _tensor_dtype(pv)
        self._grid_dtype = _tensor_dtype(
            vis_inputs.get("image_grid_thw") or vis.get_inputs()[1]
        )
        dec_inputs = {i.name: i for i in dec.get_inputs()}
        self._emb_dtype = _tensor_dtype(dec_inputs["inputs_embeds"])
        self._mask_dtype = _tensor_dtype(dec_inputs["attention_mask"])
        self._past_names = [n for n in dec_inputs if n.startswith("past_")]
        kv = dec_inputs[self._past_names[0]]
        shp = kv.shape  # [batch, heads, past, head_dim] (ints may be dynamic)
        heads = shp[1] if isinstance(shp[1], int) else 2
        hdim = shp[3] if isinstance(shp[3], int) else 128
        self._kv_zero_shape = (1, heads, 0, hdim)
        self._kv_dtype = _tensor_dtype(kv)
        # Decoder outputs are "present.<layer>.<key|value>" but the matching
        # inputs are "past_key_values.<layer>.<key|value>" — map them so the
        # step loop feeds the KV cache back under the input names.
        self._dec_out_names = [o.name for o in dec.get_outputs()]
        self._logits_name = "logits"
        self._kv_feed = {}
        for on in self._dec_out_names:
            mo = re.match(r"present\.(\d+)\.(key|value)", on)
            if mo:
                self._kv_feed[f"past_key_values.{mo.group(1)}.{mo.group(2)}"] = on

        self._vis, self._dec, self._emb, self._tok = vis, dec, emb, tok
        log.info("PaddleOCR-VL ready")

    def supports_regions(self) -> bool:
        return True

    # ── preprocessing ────────────────────────────────────────────────────

    def _preprocess_region(self, crop) -> tuple[np.ndarray, np.ndarray]:
        """NaViT-style preprocessing -> pixel_values [1,P,3,14,14] + grid.

        Patch counts (ph, pw) are always EVEN: the model merges 2x2 patches
        and reshapes attention tensors by grid/2 — an odd count produces a
        size mismatch in an internal Reshape (verified on CPU:
        {594,1152} vs {1,16,2,9,2,1152} for pw=33).
        """
        from PIL import Image

        w, h = crop.size
        target = max(self._min_pixels, 1)
        r = math.sqrt(target / max(w * h, 1))
        # nearest EVEN patch count (2x2 merge requires grid/2 to be integer)
        pw = max(2, int(round(w * r / _PATCH / 2)) * 2)
        ph = max(2, int(round(h * r / _PATCH / 2)) * 2)

        def area() -> int:
            return pw * ph * _PATCH * _PATCH

        if area() < target:  # rounding undershoot — bump the smaller axis
            if pw <= ph:
                pw += 2
            else:
                ph += 2
        if self._max_pixels and area() > self._max_pixels:
            while area() > self._max_pixels and pw > 2 and ph > 2:
                if pw >= ph:
                    pw -= 2
                else:
                    ph -= 2
        # int8 caveat: keep the patch count bounded
        while pw * ph > MAX_PATCHES and pw > 2 and ph > 2:
            if pw >= ph:
                pw -= 2
            else:
                ph -= 2

        w2, h2 = pw * _PATCH, ph * _PATCH
        img = crop.resize((w2, h2), Image.Resampling.BICUBIC)
        arr = np.asarray(img, np.float32) / 255.0
        for c in range(3):
            arr[..., c] = (arr[..., c] - self._mean[c]) / self._std[c]
        arr = arr.transpose(2, 0, 1)  # [3, h2, w2]
        patches = (
            arr.reshape(3, ph, _PATCH, pw, _PATCH)
            .transpose(1, 3, 0, 2, 4)
            .reshape(-1, 3, _PATCH, _PATCH)
        )
        grid = np.array([[1, ph, pw]], np.int64)
        return patches[np.newaxis], grid  # [1,P,3,14,14], [1,3]

    # ── decoding ─────────────────────────────────────────────────────────

    def _ocr_region(self, crop) -> str:
        """Full pipeline on one crop: vision -> embed -> prefill -> step loop."""
        vis, emb, dec, tok = self._vis, self._emb, self._dec, self._tok
        assert vis is not None and emb is not None and dec is not None and tok is not None

        pixel_values, grid = self._preprocess_region(crop)
        image_embeds = np.asarray(
            vis.run(
                None,
                {
                    "pixel_values": pixel_values.astype(self._vis_dtype),
                    "image_grid_thw": grid.astype(self._grid_dtype),
                },
            )[0]
        )  # [P/4, 1024]

        n_ph = image_embeds.shape[0]
        input_ids = self._prefix_ids + [self._ph_id] * n_ph + self._suffix_ids
        in_emb = np.asarray(
            emb.run(None, {"input_ids": np.array([input_ids], np.int64)})[0]
        ).astype(self._emb_dtype)
        ph0 = len(self._prefix_ids)
        in_emb[0, ph0 : ph0 + n_ph] = image_embeds.astype(self._emb_dtype)

        seq_len = len(input_ids)
        feed = {
            "inputs_embeds": in_emb,
            "attention_mask": np.ones((1, seq_len), self._mask_dtype),
            **{nm: np.zeros(self._kv_zero_shape, self._kv_dtype) for nm in self._kv_feed},
        }
        out = dec.run(None, feed)
        out_map = dict(zip(self._dec_out_names, out))
        logits = np.asarray(out_map[self._logits_name])[0, -1].astype(np.float64)
        present = {
            inp: np.asarray(out_map[oname]) for inp, oname in self._kv_feed.items()
        }

        toks: list[int] = []
        for _ in range(MAX_NEW_TOKENS):
            nxt = int(np.argmax(logits))
            if nxt == self._eos:
                break
            toks.append(nxt)
            seq_len += 1
            next_emb = np.asarray(
                emb.run(None, {"input_ids": np.array([[nxt]], np.int64)})[0]
            ).astype(self._emb_dtype)
            feed = {
                "inputs_embeds": next_emb,
                "attention_mask": np.ones((1, seq_len), self._mask_dtype),
                **present,
            }
            out = dec.run(None, feed)
            out_map = dict(zip(self._dec_out_names, out))
            logits = np.asarray(out_map[self._logits_name])[0, -1].astype(np.float64)
            present = {
                inp: np.asarray(out_map[oname]) for inp, oname in self._kv_feed.items()
            }
        return tok.decode(toks, skip_special_tokens=True).strip()

    # ── API ──────────────────────────────────────────────────────────────

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        """Per-box fallback path (also used when a region's line count
        doesn't match its box count)."""
        from PIL import Image

        self._load()
        img = Image.open(image_path).convert("RGB")
        texts: list[str] = []
        for i, b in enumerate(boxes):
            x0 = max(0, int(b["x"]))
            y0 = max(0, int(b["y"]))
            x1 = min(img.width, x0 + max(1, int(b["w"])))
            y1 = min(img.height, y0 + max(1, int(b["h"])))
            text = self._ocr_region(img.crop((x0, y0, x1, y1)))
            texts.append(text)
            log.debug(f"OCR box {i + 1}/{len(boxes)}: {text!r}")
        return texts

    def ocr_regions(self, image_path: str, regions: list[dict]) -> list[list[str]]:
        """Region mode: one VLM pass per region, output split into lines
        aligned to the region's boxes (reading order). Falls back to
        per-box recognition when the line count doesn't match."""
        from PIL import Image

        self._load()
        img = Image.open(image_path).convert("RGB")
        out: list[list[str]] = []
        for ri, region in enumerate(regions):
            boxes = region["boxes"]
            pad = 8  # a little context around the merged boxes
            x0 = max(0, int(region["x"]) - pad)
            y0 = max(0, int(region["y"]) - pad)
            x1 = min(img.width, int(region["x"] + region["w"]) + pad)
            y1 = min(img.height, int(region["y"] + region["h"]) + pad)
            text = self._ocr_region(img.crop((x0, y0, x1, y1)))
            lines = [ln.strip() for ln in text.split("\n")]
            lines = [ln for ln in lines if ln]
            if lines and len(lines) == len(boxes):
                out.append(lines)
                log.debug(
                    f"OCR region {ri + 1}/{len(regions)} ({len(boxes)} boxes): {lines!r}"
                )
            else:
                log.warn(
                    f"Region {ri + 1}/{len(regions)}: model returned {len(lines)} "
                    f"line(s) for {len(boxes)} box(es) — falling back per-box"
                )
                out.append(self.ocr_boxes(image_path, boxes))
        return out
