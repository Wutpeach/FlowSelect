from __future__ import annotations

from typing import Optional

PROGRESS_PREFIX = "FLOWSELECT_PINTEREST_PROGRESS"
RESULT_PREFIX = "FLOWSELECT_PINTEREST_RESULT"
STAGE_PREFIX = "FLOWSELECT_PINTEREST_STAGE"


def emit_stage(stage: str) -> None:
    print(f"{STAGE_PREFIX}\t{stage}", flush=True)


def emit_progress(done: float, total: float) -> None:
    total_value = max(float(total), 1.0)
    done_value = min(max(float(done), 0.0), total_value)
    print(f"{PROGRESS_PREFIX}\t{done_value}\t{total_value}", flush=True)


def emit_result(path: str) -> None:
    print(f"{RESULT_PREFIX}\t{path}", flush=True)


def emit_optional_progress(done: Optional[float], total: Optional[float]) -> None:
    if done is None or total is None:
        return
    emit_progress(done, total)

