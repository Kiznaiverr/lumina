import argparse
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
import uvicorn

from schemas import DetectRequest, DetectResponse, TextDetection, BubbleDetection, ModelStatus

app = FastAPI(title="Lumina Backend", version="0.1.0")


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
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Detection model not available: {e}. Install deps first.",
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
    try:
        from services.detect import download_model
        download_model()
        return {"status": "ok"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"[Lumina Backend] Starting on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
