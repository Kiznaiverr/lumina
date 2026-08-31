"""Manga-finetuned LaMa — better reconstruction on manga text regions."""
from __future__ import annotations

from ..lama.model import LamaModel
from .config import MODEL_FILENAME, MODEL_ID, OUTPUT_SCALE


class LamaMangaModel(LamaModel):
    name = "LaMa Manga"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME
    output_scale = OUTPUT_SCALE
