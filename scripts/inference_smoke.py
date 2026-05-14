"""Judge-facing smoke check for the offline LPSE-X inference path."""

from __future__ import annotations

import json

from src.product_demo import build_inference_run

EXPECTED_ROWS_SCORED = 93034


def main() -> None:
    """Score the full held-out split and assert the bounded UI contract."""
    _, backend, predictions, queue, metadata = build_inference_run(max_rows=None, top_n=50)
    summary = {
        "model": backend.model_artifact.name,
        "rows_scored": metadata.rows_scored,
        "rows_displayed": len(queue),
        "rank_1": queue.iloc[0]["case_id"],
        "latency_ms": metadata.total_latency_ms,
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


if __name__ == "__main__":
    main()
