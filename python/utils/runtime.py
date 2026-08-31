"""ONNX Runtime execution-provider resolution + GPU detection.

Windows reality (Lumina is a desktop app; most users are on Windows):

  - ``onnxruntime-directml`` (DX12): one wheel covers NVIDIA, AMD, and
    Intel GPUs (incl. iGPUs) and still ships CPUExecutionProvider as a
    fallback. This is the bundled default.
  - ``onnxruntime-gpu`` (CUDA): fastest on NVIDIA but needs CUDA + cuDNN
    DLLs installed — opt-in only. Both wheels install the same
    ``onnxruntime`` module, so they cannot coexist in one venv.

Provider selection is resolved per session by :func:`create_session`:

  - ``LUMINA_EP`` env: ``auto`` (default) | ``cuda`` | ``dml`` | ``cpu``.
    An explicit env override wins over per-call ``prefer``.
  - Without an override: CUDA EP when the wheel supports it, else DirectML
    when supported, else CPU. GPU EPs are only *attempted* — a session
    that fails to build (missing DLLs, outdated driver) automatically
    falls back to CPU so the app keeps working.
  - Autoregressive decoders (manga-ocr decoder, Baberu prefill/step) pass
    ``prefer="cpu"`` — many tiny sequential calls where DirectML launch
    overhead outweighs any speedup.

:func:`get_device_info` powers ``GET /device`` (Settings → Models badge):
the active EP and the GPU list (Win32_VideoController via PowerShell,
cached once per backend process).
"""
from __future__ import annotations

import os
import subprocess
from typing import Any, Optional

from utils.logger import log

try:  # pragma: no cover - import failure only on broken installs
    import onnxruntime as ort
except ImportError:
    ort = None

_GPU_NAMES_CACHE: Optional[list[str]] = None
_DEVICE_CACHE: Optional[dict] = None


def get_available_providers() -> list[str]:
    """EPs the installed wheel actually supports (may be CPU-only)."""
    if ort is None:
        return []
    try:
        return list(ort.get_available_providers())
    except Exception as e:
        log.warn(f"onnxruntime provider probe failed: {e}")
        return []


def resolve_providers(prefer: Optional[str] = None) -> list[str]:
    """Provider list for ``InferenceSession``, in priority order.

    ``prefer`` is one of ``"auto"`` | ``"cuda"`` | ``"dml"`` | ``"cpu"``;
    an explicit ``LUMINA_EP`` env value overrides it (user intent wins).
    GPU EPs are only included when the installed wheel supports them.
    """
    env = os.environ.get("LUMINA_EP", "").strip().lower()
    if env in ("cuda", "dml", "cpu"):
        pref = env
    elif not prefer:
        pref = "auto"
    else:
        pref = prefer.strip().lower()

    avail = get_available_providers()
    cuda, dml, cpu = (
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    )

    if pref == "cpu":
        return [cpu]
    if pref == "cuda":
        return [cuda, cpu] if cuda in avail else [cpu]
    if pref == "dml":
        return [dml, cpu] if dml in avail else [cpu]
    # auto: CUDA (fastest) → DirectML (covers every Windows GPU incl.
    # AMD/Intel) → CPU. Never more than one GPU EP is present in a wheel.
    eps: list[str] = []
    if cuda in avail:
        eps.append(cuda)
    if dml in avail:
        eps.append(dml)
    eps.append(cpu)
    return eps


def make_session_options() -> Any:
    """Session options shared by every model (graph fusion enabled)."""
    if ort is None:  # pragma: no cover
        raise RuntimeError("onnxruntime is not installed")
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return opts


def create_session(
    model_path,
    prefer: Optional[str] = None,
    sess_options: Optional[Any] = None,
) -> Any:
    """Build an InferenceSession with resolved providers.

    GPU session creation can fail at runtime (missing CUDA DLLs, outdated
    driver, D3D device failure). Falls back to CPU for that session so the
    app never breaks; the failure is logged once per model.
    """
    if ort is None:  # pragma: no cover
        raise RuntimeError("onnxruntime is not installed")
    providers = resolve_providers(prefer)
    if sess_options is None:
        sess_options = make_session_options()
    try:
        return ort.InferenceSession(
            str(model_path), sess_options=sess_options, providers=providers
        )
    except Exception as e:
        if providers == ["CPUExecutionProvider"]:
            raise
        log.warn(
            f"GPU session failed ({e}); falling back to CPU for "
            f"{os.path.basename(str(model_path))}"
        )
        return ort.InferenceSession(
            str(model_path),
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )


def _windows_gpu_names() -> list[str]:
    """GPU names via Win32_VideoController (PowerShell). Cached."""
    global _GPU_NAMES_CACHE
    if _GPU_NAMES_CACHE is not None:
        return _GPU_NAMES_CACHE
    names: list[str] = []
    try:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        out = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=flags,
        )
        names = [line.strip() for line in out.stdout.splitlines() if line.strip()]
        if names:
            log.info(f"Detected GPU(s): {', '.join(names)}")
    except Exception as e:
        log.debug(f"GPU name detection failed: {e}")
    _GPU_NAMES_CACHE = names
    return names


def _pick_gpu(names: list[str], provider: str) -> Optional[str]:
    """Pick the GPU to display, preferring discrete adapters."""
    skip = (
        "microsoft basic",
        "basic render",
        "remote display",
        "virtualbox",
        "vmware",
        "cirrus",
        "paravirtual",
    )
    usable = [n for n in names if not any(s in n.lower() for s in skip)]
    if not usable:
        return None
    discrete = (
        "nvidia", "geforce", "radeon", "rtx", "gtx", "quadro", "arc",
    )
    if provider == "cuda":
        for n in usable:
            low = n.lower()
            if "nvidia" in low or "geforce" in low or "quadro" in low:
                return n
    for n in usable:
        low = n.lower()
        if any(k in low for k in discrete):
            return n
    return usable[0]


def get_device_info() -> dict:
    """Probe active EP + GPU names. Cheap after the first call (cached)."""
    global _DEVICE_CACHE
    if _DEVICE_CACHE is not None:
        return dict(_DEVICE_CACHE)

    eps = get_available_providers()
    cuda, dml, cpu = (
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    )
    # An explicit LUMINA_EP=cpu override (GPU toggle off) forces CPU even
    # when the wheel ships a GPU EP.
    forced_cpu = os.environ.get("LUMINA_EP", "").strip().lower() == "cpu"
    has_gpu_ep = (cuda in eps or dml in eps) and not forced_cpu

    gpus: list[str] = []
    if has_gpu_ep and os.name == "nt":
        gpus = _windows_gpu_names()

    if not forced_cpu and cuda in eps:
        provider, ep = "cuda", cuda
    elif not forced_cpu and dml in eps:
        provider, ep = "dml", dml
    else:
        provider, ep = "cpu", cpu

    info = {
        "provider": provider,  # "cuda" | "dml" | "cpu"
        "ep": ep,              # full ORT provider name
        "gpus": gpus,
        "gpuName": _pick_gpu(gpus, provider),
        "onnxRuntime": ort.__version__ if ort else None,
        # GPU EP is available in this wheel — actual per-session success is
        # verified lazily when each model loads (create_session fallback).
        "accelerated": provider != "cpu",
    }
    _DEVICE_CACHE = info
    return dict(info)


def configure(use_gpu: bool) -> dict:
    """Set/clear the ``LUMINA_EP`` override for this backend process.

    Effective immediately for every session created afterwards
    (:func:`resolve_providers` reads the env per call; the keep-one-hot
    policy unloads models after each step, so the next pipeline step picks
    up the new EP). Also resets the device-info cache. Returns the updated
    :func:`get_device_info` result.
    """
    global _DEVICE_CACHE
    if use_gpu:
        os.environ.pop("LUMINA_EP", None)
        log.info("GPU acceleration enabled (LUMINA_EP cleared -> auto)")
    else:
        os.environ["LUMINA_EP"] = "cpu"
        log.info("GPU acceleration disabled (LUMINA_EP=cpu)")
    _DEVICE_CACHE = None
    return get_device_info()
