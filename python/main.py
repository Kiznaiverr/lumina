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
    ModelInfo,
    ModelDownloadRequest,
    OcrRequest,
    OcrResponse,
    OcrResult,
    TranslateRequest,
    TranslateResponse,
    TranslateResult,
    InpaintPatch,
    InpaintRequest,
    InpaintResponse,
)

from utils.logger import log

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

        result = run_detect(req.imagePath, model=req.model)
        return DetectResponse(
            textDetections=[TextDetection(**d) for d in result["textDetections"]],
            bubbleDetections=[BubbleDetection(**d) for d in result["bubbleDetections"]],
        )
    except Exception as e:
        log.error(f"Detect failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
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
            req.imagePath, [b.model_dump() for b in req.boxes], model=req.model
        )
        return OcrResponse(
            results=[OcrResult(index=i, text=t) for i, t in enumerate(texts)]
        )
    except Exception as e:
        log.error(f"OCR failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
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
        log.error(f"Translate failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/inpaint", response_model=InpaintResponse)
def inpaint(req: InpaintRequest):
    if not Path(req.imagePath).is_file():
        raise HTTPException(status_code=400, detail="Image file not found")

    try:
        from services.inpaint import inpaint_boxes

        patches = inpaint_boxes(
            req.imagePath, [b.model_dump() for b in req.boxes], model=req.model
        )
        return InpaintResponse(
            patches=[InpaintPatch(**p) for p in patches]
        )
    except Exception as e:
        log.error(f"Inpaint failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def _all_model_infos() -> list[dict]:
    from services.detect import get_models_info as detect_infos
    from services.ocr import get_models_info as ocr_infos
    from services.inpaint import get_models_info as inpaint_infos

    return detect_infos() + ocr_infos() + inpaint_infos()


@app.get("/models", response_model=ModelStatus)
def models_list():
    """Full model registry: per-model ready state + sizes for the settings UI."""
    infos = _all_model_infos()
    return ModelStatus(
        cached=all(i["ready"] for i in infos),
        models=[ModelInfo(**i) for i in infos],
    )


@app.get("/model/check", response_model=ModelStatus)
def model_check():
    return models_list()


@app.post("/model/download")
def model_download(req: ModelDownloadRequest):
    """Start background downloads for the requested models only.
    Empty `models` = every missing model. Poll /model/progress for status."""
    from services import detect as detect_service
    from services import ocr as ocr_service
    from services import inpaint as inpaint_service

    if _download_state["running"]:
        return {"status": "started"}

    def _cb(pct: int, downloaded: int, total: int) -> None:
        _download_state["progress"] = pct
        _download_state["downloaded"] = downloaded
        _download_state["total"] = total

    # Resolve requested ids → [(progress label, downloader), ...], skipping
    # models that are already installed. `None` = download everything.
    want = set(req.models) if req.models else None

    def _wants(x: str) -> bool:
        return want is None or x in want

    targets: list[tuple[str, object]] = []

    if _wants("detect"):
        detect_ids = list(detect_service.MODELS)
    else:
        detect_ids = [x for x in (want or []) if x in detect_service.MODELS]
    for name in detect_ids:
        model = detect_service.MODELS[name]
        if not model.is_ready():
            targets.append(("detect", lambda m=model: m.download(_cb)))

    if _wants("ocr"):
        ocr_ids = list(ocr_service.MODELS)
    else:
        ocr_ids = [x for x in (want or []) if x in ocr_service.MODELS]
    for name in ocr_ids:
        model = ocr_service.MODELS[name]
        if not model.is_ready():
            targets.append(("ocr", lambda m=model: m.download(_cb)))

    if _wants("inpaint"):
        inpaint_ids = list(inpaint_service.MODELS)
    else:
        inpaint_ids = [x for x in (want or []) if x in inpaint_service.MODELS]
    for name in inpaint_ids:
        model = inpaint_service.MODELS[name]
        if not model.is_ready():
            targets.append(("inpaint", lambda m=model: m.download(_cb)))

    if not targets:
        return {"status": "ok", "alreadyPresent": True}

    _download_state.update(
        {"running": True, "progress": 0, "downloaded": 0, "total": 0, "done": False, "error": None, "model": None}
    )

    def _worker() -> None:
        try:
            for label, fn in targets:
                _download_state["model"] = label
                fn()
            _download_state["done"] = True
            _download_state["progress"] = 100
        except Exception as e:
            log.error(f"Model download failed: {e}")
            import traceback

            log.debug(traceback.format_exc())
            _download_state["error"] = str(e)
        finally:
            _download_state["running"] = False

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
