"""Bundle launcher — prepend dynamic runtime paths, then start main.

The embedded Python distribution ships a ``._pth`` file, which makes the
interpreter IGNORE the ``PYTHONPATH`` environment variable. The Electron
main process therefore passes extra import dirs (runtime/, the active
onnxruntime variant folder, site-packages) through ``LUMINA_PYTHONPATH``
(os.pathsep-joined) and we insert them into ``sys.path`` here, before any
Lumina import happens.

In development this file is not used — ``main.py`` is run directly with
the venv interpreter, where normal path rules apply.
"""
from __future__ import annotations

import os
import sys


def _prepend_env_paths() -> None:
    raw = os.environ.get("LUMINA_PYTHONPATH", "")
    if not raw:
        return
    for d in reversed([p for p in raw.split(os.pathsep) if p]):
        if d not in sys.path:
            sys.path.insert(0, d)


_prepend_env_paths()

if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import main

    main.main()
