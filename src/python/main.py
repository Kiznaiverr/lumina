import argparse
import os
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
import uvicorn

from schemas import DetectRequest, DetectResponse, TextDetection, BubbleDetection, ModelStatus

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


@app.get("/model/check", response_model=ModelStatus)
def model_check():
    from services.detect import is_model_ready
    return ModelStatus(cached=is_model_ready())


@app.post("/model/download")
def model_download():
    """Start model download in background thread. Poll /model/progress for status."""
    from services import detect as detect_service

    if detect_service.is_model_ready():
        return {"status": "ok", "alreadyPresent": True}

    if _download_state["running"]:
        return {"status": "started"}

    _download_state.update(
        {"running": True, "progress": 0, "downloaded": 0, "total": 0, "done": False, "error": None}
    )

    def _cb(pct: int, downloaded: int, total: int) -> None:
        _download_state["progress"] = pct
        _download_state["downloaded"] = downloaded
        _download_state["total"] = total

    def _worker() -> None:
        try:
            detect_service.progress_callback = _cb
            detect_service.download_model()
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
