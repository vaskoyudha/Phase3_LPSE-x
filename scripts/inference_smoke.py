"""Smoke check for the FastAPI runtime.

Boots the cached held-out runtime via the API helpers and prints a short
summary so operators can verify the service is wired up to the ML repo
correctly without having to start uvicorn.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

EXPECTED_ROWS_SCORED = 93034


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from src.api import _build_status, _load_runtime  # noqa: WPS433

    dataset, backend, predictions, queue, metadata = _load_runtime()
    summary = {
        "model_artifact": Path(backend.model_artifact).name,
        "feature_source": metadata.feature_source,
        "raw_source": metadata.raw_source,
        "rows_scored": metadata.rows_scored,
        "rows_ranked": metadata.rows_ranked,
        "queue_top": int(min(5, len(queue))),
        "no_cloud_call": metadata.no_cloud_call,
        "no_live_scraping": metadata.no_live_scraping,
        "no_retraining": metadata.no_retraining,
        "build_status": _build_status().model_dump(),
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))

    # Artifact and row-count assertions
    assert metadata.model_artifact == "model_risk.ubj"
    assert metadata.rows_scored == EXPECTED_ROWS_SCORED, (
        f"Expected {EXPECTED_ROWS_SCORED} rows scored, got {metadata.rows_scored}"
    )
    assert metadata.rows_scored == len(predictions)
    assert len(queue) == 50

    # Guardrail metadata flags
    assert metadata.no_cloud_call, "no_cloud_call must be True"
    assert metadata.no_retraining, "no_retraining must be True"
    assert metadata.no_live_scraping, "no_live_scraping must be True"
    return 0


if __name__ == "__main__":
    sys.exit(main())
