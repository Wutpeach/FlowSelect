from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict


def lock_path() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS).resolve() / "lock.json"
    return Path(__file__).resolve().with_name("lock.json")


def load_lock() -> Dict[str, Any]:
    return json.loads(lock_path().read_text(encoding="utf-8"))


def sidecar_version() -> str:
    return str(load_lock()["flowselectSidecarVersion"])
