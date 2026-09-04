"""PP-OCRv6 medium rec — multilingual text recognition (CTC, one pass).

The character dictionary lives in inference.yml, so the download is just
the two inference files.

Split: preprocess.py (RecResizeImg + line splitting), postprocess.py (CTC
decode). This module owns the session + character vocab and orchestrates.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import numpy as np

from utils.logger import log
from ..base import BaseOcrModel
from . import postprocess as pp
from . import preprocess as prep
from .config import (
    DOWNLOAD_FILES,
    MODEL_DIR_NAME,
    MODEL_ID,
    ONNX_FILE,
    PREFER,
    REQUIRED_FILES,
    YAML_FILE,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


class PPOcrV6Model(BaseOcrModel):
    name = "PP-OCRv6 (Paddle)"
    status = "ready"
    model_id = MODEL_ID
    model_dir_name = MODEL_DIR_NAME
    required_files = REQUIRED_FILES
    download_files = DOWNLOAD_FILES
    prefer = PREFER

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
            self.model_dir / ONNX_FILE,
            prefer=self.prefer,
            sess_options=make_session_options(),
        )
        cfg = yaml.safe_load(
            (self.model_dir / YAML_FILE).read_text(encoding="utf-8")
        )
        chars = list(cfg["PostProcess"]["character_dict"])
        self._chars = ["blank"] + chars + [" "]  # idx 0 = CTC blank, last = space
        log.info(f"PP-OCRv6 ready ({len(chars)} chars)")

    def ocr_boxes(self, image_path: str, boxes: list[dict]) -> list[str]:
        import numpy as np

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
            crop_bgr = prep.to_bgr(crop)

            # split_lines decides vertical/horizontal from the crop content.
            lines, vertical = prep.split_lines(crop_bgr)

            parts: list[str] = []
            for line in lines:
                tensor = prep.preprocess(line)[None]
                out = np.asarray(sess.run(None, {input_name: tensor})[0])
                text, score = pp.ctc_decode(self._chars, out[0])
                lh, lw = line.shape[:2]
                # Drop low-confidence or tiny rows (bubble borders/tails).
                if not text or score < 0.3 or (lh < 24 and lh * lw < 550):
                    continue
                parts.append(text)
                log.debug(f"OCR box {i + 1}/{len(boxes)} ({score:.2f}): {text!r}")
            # Vertical columns read right-to-left as one logical line.
            texts.append("".join(parts) if vertical else "\n".join(parts))

        return texts
