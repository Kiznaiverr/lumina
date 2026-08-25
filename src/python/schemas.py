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


class ModelStatus(BaseModel):
    cached: bool
