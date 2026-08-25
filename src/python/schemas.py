"""Shared Pydantic schemas for request/response models."""
from __future__ import annotations

from pydantic import BaseModel


class Bbox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class TextDetection(BaseModel):
    bbox: Bbox
    type: str  # "text_bubble" | "text_free"
    confidence: float


class BubbleDetection(BaseModel):
    bbox: Bbox
    confidence: float


# NOTE: bubbleDetections are kept in the API response for future use, but the
# Electron frontend currently IGNORES them — OCR, translation, and inpainting
# all operate on textDetections only. Do not add FE features that depend on
# bubbles without revisiting this decision.


class DetectRequest(BaseModel):
    imagePath: str


class DetectResponse(BaseModel):
    textDetections: list[TextDetection]
    bubbleDetections: list[BubbleDetection]


class OcrRequest(BaseModel):
    imagePath: str
    boxes: list[Bbox]


class OcrResult(BaseModel):
    index: int
    text: str


class OcrResponse(BaseModel):
    results: list[OcrResult]


class TranslateConfig(BaseModel):
    provider: str  # "google" | "deepl" | "llm"
    sourceLang: str = "ja"
    targetLang: str = "en"
    apiKey: str | None = None
    llmBaseUrl: str | None = None
    llmApiKey: str | None = None
    llmModel: str | None = None
    llmInstruction: str | None = None
    geminiApiKey: str | None = None
    geminiModel: str | None = None


class TranslateRequest(BaseModel):
    texts: list[str]
    config: TranslateConfig
    # Optional per-text continuity context, aligned with texts by index
    previousLines: list[str] | None = None


class TranslateResult(BaseModel):
    index: int
    text: str


class TranslateResponse(BaseModel):
    results: list[TranslateResult]


class InpaintRequest(BaseModel):
    imagePath: str
    boxes: list[Bbox]


class InpaintResponse(BaseModel):
    outputPath: str


class ModelStatus(BaseModel):
    cached: bool
