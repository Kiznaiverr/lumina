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
    model: str = "rtdetr"


class DetectResponse(BaseModel):
    textDetections: list[TextDetection]
    bubbleDetections: list[BubbleDetection]


class OcrRequest(BaseModel):
    imagePath: str
    boxes: list[Bbox]
    model: str = "manga_ocr"


class OcrResult(BaseModel):
    index: int
    text: str


class OcrResponse(BaseModel):
    results: list[OcrResult]


class TranslateConfig(BaseModel):
    provider: str  # "custom" | "openrouter" | "grok" | "gemini"
    sourceLang: str = "auto"  # "auto" = model detects the source language
    targetLang: str = "en"
    apiKey: str | None = None
    llmBaseUrl: str | None = None
    llmApiKey: str | None = None
    llmModel: str | None = None
    llmStyle: str | None = None  # "openai" | "anthropic" (custom provider only)
    llmInstruction: str | None = None
    openrouterApiKey: str | None = None
    openrouterModel: str | None = None
    grokApiKey: str | None = None
    grokModel: str | None = None
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
    model: str = "lama"


class InpaintPatch(BaseModel):
    bbox: Bbox
    imagePath: str


class InpaintResponse(BaseModel):
    patches: list[InpaintPatch]


class ModelInfo(BaseModel):
    id: str  # "detect" | "ocr" | inpaint registry key ("lama")
    name: str  # display name
    kind: str  # "detect" | "ocr" | "inpaint"
    ready: bool
    size: int | None = None  # bytes of installed weights; None if not installed
    description: str = ""  # short blurb shown in the Settings → Models tab


class ModelStatus(BaseModel):
    cached: bool
    models: list[ModelInfo] = []


class ModelDownloadRequest(BaseModel):
    # Empty = download every missing model. Otherwise only these ids
    # ("detect", "ocr", or inpaint registry keys like "lama").
    models: list[str] = []
