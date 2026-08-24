"""Detection service — RT-DETR-v2 ogkalu/comic-text-and-bubble-detector."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

_model = None
_processor = None

MODEL_ID = "ogkalu/comic-text-and-bubble-detector"


def is_model_ready() -> bool:
    """Check if model is already downloaded and cached."""
    from huggingface_hub import try_to_load_from_cache
    try:
        # Check if safetensors file exists in cache
        result = try_to_load_from_cache(MODEL_ID, "model.safetensors")
        return not isinstance(result, type(None))
    except Exception:
        return False


def download_model() -> None:
    """Download model from HuggingFace. Blocks until done."""
    from huggingface_hub import snapshot_download
    print(f"[Lumina] Downloading model {MODEL_ID}...")
    snapshot_download(repo_id=MODEL_ID)
    print("[Lumina] Model download complete")

# Class IDs from the model
CLASS_MAP = {
    0: "bubble",
    1: "text_bubble",
    2: "text_free",
}


def _load_model():
    global _model, _processor
    if _model is None:
        import torch
        from transformers import AutoModelForObjectDetection, AutoImageProcessor

        if not is_model_ready():
            download_model()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Lumina] Loading detection model on {device}...")
        _processor = AutoImageProcessor.from_pretrained(MODEL_ID)
        _model = AutoModelForObjectDetection.from_pretrained(MODEL_ID).to(device)
        _model.eval()
        print("[Lumina] Detection model loaded")


def detect(image_path: str) -> dict:
    """
    Run detection on an image file.
    Returns { textDetections: [...], bubbleDetections: [...] }.
    """
    import torch

    _load_model()
    assert _model is not None and _processor is not None

    img = Image.open(image_path).convert("RGB")
    inputs = _processor(images=img, return_tensors="pt")

    device = next(_model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = _model(**inputs)

    # Convert to absolute pixel coordinates
    w, h = img.size
    results = _processor.post_process_object_detection(
        outputs, threshold=0.3, target_sizes=[(h, w)]
    )[0]

    text_detections = []
    bubble_detections = []

    for score, label_id, box in zip(
        results["scores"], results["labels"], results["boxes"]
    ):
        xmin, ymin, xmax, ymax = box.tolist()
        bbox = {
            "x": int(round(xmin)),
            "y": int(round(ymin)),
            "w": int(round(xmax - xmin)),
            "h": int(round(ymax - ymin)),
        }
        conf = round(float(score), 4)
        cls_name = CLASS_MAP.get(int(label_id), "bubble")

        if cls_name == "bubble":
            bubble_detections.append({"bbox": bbox, "confidence": conf})
        else:
            # text_bubble or text_free
            text_detections.append({
                "bbox": bbox,
                "type": cls_name,
                "confidence": conf,
            })

    print(
        f"[Lumina] Detected {len(text_detections)} text, "
        f"{len(bubble_detections)} bubbles"
    )
    return {"textDetections": text_detections, "bubbleDetections": bubble_detections}
