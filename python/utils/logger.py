"""Minimal leveled logger for the Lumina backend.

Usage::

    from utils.logger import log

    log.debug("per-step detail")
    log.info("model loaded")
    log.warn("cache miss")
    log.error("request failed")

Levels: ``debug < info < warn < error``. Default level is ``info``;
override with the ``LUMINA_LOG_LEVEL`` env var. Thread-safe (model
downloads run on a worker thread). Every line keeps the ``[Lumina]``
prefix so the Electron main process output stays greppable.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime

_LEVELS: dict[str, int] = {"debug": 10, "info": 20, "warn": 30, "error": 40}
_current = _LEVELS.get(os.environ.get("LUMINA_LOG_LEVEL", "info").lower(), 20)
_lock = threading.Lock()


def set_level(name: str) -> None:
    """Set the minimum level at runtime (e.g. "debug")."""
    global _current
    _current = _LEVELS.get(name.lower(), 20)


def _emit(level: str, level_no: int, msg: str) -> None:
    if level_no < _current:
        return
    ts = datetime.now().strftime("%H:%M:%S")
    with _lock:
        print(f"[Lumina] [{ts}] [{level.upper()}] {msg}", flush=True)


class _Log:
    @staticmethod
    def debug(msg: str) -> None:
        _emit("debug", 10, msg)

    @staticmethod
    def info(msg: str) -> None:
        _emit("info", 20, msg)

    @staticmethod
    def warn(msg: str) -> None:
        _emit("warn", 30, msg)

    @staticmethod
    def error(msg: str) -> None:
        _emit("error", 40, msg)


log = _Log()
