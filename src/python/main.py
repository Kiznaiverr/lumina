import argparse
import os
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
import uvicorn

from schemas import (
    DetectRequest,
    DetectResponse,
    TextDetection,
    BubbleDetection,
    ModelStatus,
    OcrRequest,
    OcrResponse,
    OcrResult,
    TranslateRequest,
    TranslateResponse,
    TranslateResult,
    InpaintRequest,
    InpaintResponse,
)

app = FastAPI(title="Lumina Backend", version="0.1.0")

# Shared download progress state (written by download thread, read by /model/progress)
_download_state: dict = {
    "running": False,
    "progress": 0,
    "downloaded": 0,
    "total": 0,
    "done": False,
    "error": None,
}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    if not Path(req.imagePath).is_file():
        raise HTTPException(status_code=400, detail="Image file not found")

    try:
        from services.detect import detect as run_detect

        result = run_detect(req.imagePath)
        return DetectResponse(
            textDetections=[TextDetection(**d) for d in result["textDetections"]],
            bubbleDetections=[BubbleDetection(**d) for d in result["bubbleDetections"]],
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest):
    if not Path(req.imagePath).is_file():
        raise HTTPException(status_code=400, detail="Image file not found")
    if not req.boxes:
        return OcrResponse(results=[])

    try:
        from services.ocr import ocr_boxes

        texts = ocr_boxes(
            req.imagePath, [b.model_dump() for b in req.boxes]
        )
        return OcrResponse(
            results=[OcrResult(index=i, text=t) for i, t in enumerate(texts)]
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    if not req.texts:
        return TranslateResponse(results=[])

    try:
        from services.translate import translate_texts, TranslateError

        cfg = req.config.model_dump()
        prev_lines = req.previousLines or []
        # Per-text continuity context (used by single-text LLM calls)
        if prev_lines:
            cfg["previousLines"] = prev_lines
        try:
            translated = translate_texts(req.texts, cfg)
        except TranslateError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Translation failed: {e}")
        return TranslateResponse(
            results=[TranslateResult(index=i, text=t) for i, t in enumerate(translated)]
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/inpaint", response_model=InpaintResponse)
def inpaint(req: InpaintRequest):
    if not Path(req.imagePath).is_file():
        raise HTTPException(status_code=400, detail="Image file not found")

    try:
        from services.inpaint import inpaint_boxes

        src = Path(req.imagePath)
        out = src.parent / "cache" / f"{src.stem}_cleaned{src.suffix}"
        output_path = inpaint_boxes(
            req.imagePath, [b.model_dump() for b in req.boxes], str(out)
        )
        return InpaintResponse(outputPath=output_path)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model/check", response_model=ModelStatus)
def model_check():
    from services.detect import is_model_ready as detect_ready
    from services.ocr import is_model_ready as ocr_ready
    from services.inpaint import is_model_ready as inpaint_ready

    return ModelStatus(cached=detect_ready() and ocr_ready() and inpaint_ready())


@app.post("/model/download")
def model_download():
    """Start missing-model downloads in background thread.
    Poll /model/progress for status."""
    from services import detect as detect_service
    from services import ocr as ocr_service
    from services import inpaint as inpaint_service

    if (
        detect_service.is_model_ready()
        and ocr_service.is_model_ready()
        and inpaint_service.is_model_ready()
    ):
        return {"status": "ok", "alreadyPresent": True}

    if _download_state["running"]:
        return {"status": "started"}

    _download_state.update(
        {"running": True, "progress": 0, "downloaded": 0, "total": 0, "done": False, "error": None, "model": None}
    )

    def _cb(pct: int, downloaded: int, total: int) -> None:
        _download_state["progress"] = pct
        _download_state["downloaded"] = downloaded
        _download_state["total"] = total

    def _worker() -> None:
        try:
            if not detect_service.is_model_ready():
                _download_state["model"] = "detect"
                detect_service.progress_callback = _cb
                detect_service.download_model()
                detect_service.progress_callback = None
            if not ocr_service.is_model_ready():
                _download_state["model"] = "ocr"
                ocr_service.download_model(progress_callback=_cb)
            if not inpaint_service.is_model_ready():
                _download_state["model"] = "inpaint"
                inpaint_service.progress_callback = _cb
                inpaint_service.download_model()
                inpaint_service.progress_callback = None
            _download_state["done"] = True
            _download_state["progress"] = 100
        except Exception as e:
            import traceback
            traceback.print_exc()
            _download_state["error"] = str(e)
        finally:
            _download_state["running"] = False
            detect_service.progress_callback = None

    threading.Thread(target=_worker, daemon=True).start()
    return {"status": "started"}


@app.get("/model/progress")
def model_progress():
    """Poll download progress: {running, progress, downloaded, total, done, error}."""
    return dict(_download_state)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"[Lumina Backend] Starting on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
