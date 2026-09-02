"""Shared model-download cancellation.

Model downloads run on a background thread started by ``/model/download``.
The user can cancel from the UI (``/model/cancel``); every download loop
checks :func:`is_cancelled` and removes its ``.part`` temp file before
raising :class:`DownloadCancelled` — no half-written files are left behind.
"""

import threading


class DownloadCancelled(Exception):
    """Raised by download loops when the user cancels the download."""


_cancel_event = threading.Event()


def cancel() -> None:
    """Request cancellation of the in-flight download batch."""
    _cancel_event.set()


def reset() -> None:
    """Clear any pending cancel request (called before a new batch)."""
    _cancel_event.clear()


def is_cancelled() -> bool:
    """True while a cancel has been requested and not yet reset."""
    return _cancel_event.is_set()
