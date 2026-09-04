import argparse
import os
import sys
import threading
from pathlib import Path
from typing import Callable

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
    DeviceConfigureRequest,
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
from utils.download import (
    DownloadCancelled,
    cancel as _dl_cancel,
    is_cancelled as _dl_cancelled,
    reset as _dl_reset,
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
    "cancelled": False,
}


def _cleanup_stale_parts() -> None:
    """Remove leftover ``*.part`` files from interrupted/cancelled downloads."""
    try:
        from services.detect.base import _models_dir

        removed = 0
        for p in _models_dir().rglob("*.part"):
            try:
                p.unlink(missing_ok=True)
                removed += 1
            except OSError:
                pass
        if removed:
            log.info(f"Removed {removed} stale .part download file(s)")
    except Exception as e:
        log.debug(f"Stale .part cleanup skipped: {e}")


_cleanup_stale_parts()


def _auto_download_anglenet() -> None:
    """Background auto-download of the global AngleNet model at startup.

    AngleNet is tiny (~2 MB) and needed for textAngle on every page, so it
    is fetched automatically instead of waiting for a manual Settings
    download. Skips silently when already present; a failure only logs.
    """
    try:
        from services import anglenet

        if anglenet.is_ready():
            return
        log.info("AngleNet missing - starting background auto-download")
        anglenet.download()
        log.info("AngleNet auto-download finished")
    except Exception as e:
        log.error(f"AngleNet auto-download failed: {e}")


threading.Thread(target=_auto_download_anglenet, daemon=True).start()


def _warmup_llm_sdks() -> None:
    """Pre-import the LLM SDKs so the first /translate doesn't pay the import
    cost inside the request. Runs non-blocking after startup; the window can
    open immediately and by the time a user translates, the SDKs are loaded.
    Importing is thread-safe (Python module lock) and idempotent.
    """
    try:
        import openai  # noqa: F401
        import anthropic  # noqa: F401

        log.debug("LLM SDK warmup complete")
    except Exception as e:
        log.debug(f"LLM SDK warmup skipped: {e}")


threading.Thread(target=_warmup_llm_sdks, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/device")
def device_info():
    """Active execution provider + GPU list for the Settings → Models badge."""
    from utils.runtime import get_device_info

    return get_device_info()


@app.post("/device/configure")
def device_configure(req: DeviceConfigureRequest):
    """Toggle GPU acceleration for this backend process (no restart needed)."""
    from utils.runtime import configure

    return configure(req.useGpu)


def _keep_one_hot(kind: str) -> None:
    """Release model sessions of every kind except ``kind`` (VRAM policy).

    Only the most recently used model stays resident; the rest are unloaded
    so VRAM usage stays flat (~1 model + transient activations) on small
    GPUs. Lazy re-load on the next step costs 1–3 s per model.
    Set ``LUMINA_KEEP_MODELS=1`` to disable (keep everything loaded).
    """
    if os.environ.get("LUMINA_KEEP_MODELS"):
        return
    try:
        if kind != "detect":
            from services.detect import unload_models as unload_detect

            unload_detect()
        if kind != "ocr":
            from services.ocr import unload_models as unload_ocr

            unload_ocr()
        if kind != "inpaint":
            from services.inpaint import unload_models as unload_inpaint

            unload_inpaint()
    except Exception as e:
        log.debug(f"Model unload skipped: {e}")


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    if not Path(req.imagePath).is_file():
        raise HTTPException(status_code=400, detail="Image file not found")

    try:
        from services.detect import detect as run_detect

        result = run_detect(req.imagePath, model=req.model)
        texts = result["textDetections"]
        if texts:
            from services.color import detect_text_styles

            styles = detect_text_styles(req.imagePath, [t["bbox"] for t in texts])
            for det, style in zip(texts, styles):
                if style["color"]:
                    det["textColor"] = style["color"]
                if style["angle"] is not None:
                    det["textAngle"] = style["angle"]
        return DetectResponse(
            textDetections=[TextDetection(**d) for d in texts],
            bubbleDetections=[BubbleDetection(**d) for d in result["bubbleDetections"]],
            maskPath=result.get("maskPath"),
        )
    except Exception as e:
        log.error(f"Detect failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _keep_one_hot("detect")


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
    finally:
        _keep_one_hot("ocr")


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
        if req.types:
            cfg["types"] = req.types
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
            req.imagePath,
            [b.model_dump() for b in req.boxes],
            model=req.model,
            mask_path=req.maskPath,
        )
        return InpaintResponse(
            patches=[InpaintPatch(**p) for p in patches]
        )
    except Exception as e:
        log.error(f"Inpaint failed: {e}")
        import traceback

        log.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _keep_one_hot("inpaint")


def _all_model_infos() -> list[dict]:
    from services.detect import get_models_info as detect_infos
    from services.ocr import get_models_info as ocr_infos
    from services.inpaint import get_models_info as inpaint_infos
    from services import anglenet

    aux = {
        "id": "anglenet",
        "name": "AngleNet",
        "kind": "aux",
        "status": "ready",
        "ready": anglenet.is_ready(),
        "size": anglenet.size(),
        "prefer": "cpu",
    }
    return detect_infos() + ocr_infos() + inpaint_infos() + [aux]


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

    targets: list[tuple[str, Callable[[], None]]] = []

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

    from services import anglenet

    if _wants("aux") and not anglenet.is_ready():
        targets.append(("aux", lambda: anglenet.download(_cb)))

    if not targets:
        return {"status": "ok", "alreadyPresent": True}

    _dl_reset()
    _download_state.update(
        {"running": True, "progress": 0, "downloaded": 0, "total": 0, "done": False, "error": None, "model": None, "cancelled": False}
    )

    def _worker() -> None:
        try:
            for label, fn in targets:
                if _dl_cancelled():
                    break
                _download_state["model"] = label
                fn()
            if _dl_cancelled():
                _download_state["cancelled"] = True
            else:
                _download_state["done"] = True
                _download_state["progress"] = 100
        except DownloadCancelled:
            _download_state["cancelled"] = True
        except Exception as e:
            log.error(f"Model download failed: {e}")
            import traceback

            log.debug(traceback.format_exc())
            _download_state["error"] = str(e)
        finally:
            _download_state["running"] = False
            _dl_reset()

    threading.Thread(target=_worker, daemon=True).start()
    return {"status": "started"}


@app.get("/model/progress")
def model_progress():
    """Poll download progress: {running, progress, downloaded, total, done, error}."""
    return dict(_download_state)


@app.post("/model/cancel")
def model_cancel():
    """Cancel the in-flight model download; temp .part files are removed."""
    _dl_cancel()
    return {"status": "ok"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"[Lumina Backend] Starting on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
