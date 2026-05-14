"""Frontend contract tests.

Until `frontend/src/types/api.ts` exists, this file enforces backend-side
contract guarantees the frontend will rely on (field names, status codes,
guardrail copy, bounded payload shapes). Once the React app lands, expand
this file to also cross-check that frontend code consumes only documented
fields.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import src.api as api_module
from src.api import app


ML_REPO = Path(api_module.__file__).resolve().parents[1].parent / "lpseN"
HELD_OUT_FEATURES = ML_REPO / "test_data" / "features.parquet"
MODEL_ARTIFACT = ML_REPO / "model_risk.ubj"


def _runtime_available() -> bool:
    if not HELD_OUT_FEATURES.exists() or not MODEL_ARTIFACT.exists():
        return False
    try:
        importlib.import_module("xgboost")
    except Exception:
        return False
    return True


runtime_only = pytest.mark.skipif(
    not _runtime_available(),
    reason="held-out runtime not available",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_health_response_shape(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert set(body) >= {"ok", "mode", "guardrail"}
    assert body["mode"] == "offline_local"


@runtime_only
def test_demo_state_response_keys_match_frontend_contract(client: TestClient) -> None:
    body = client.get("/api/demo-state").json()
    expected = {
        "ready",
        "offline_mode",
        "demo_case_id",
        "demo_queue_url",
        "casebook_url",
        "export_html_url",
        "model_artifact",
        "feature_source",
        "raw_source",
        "inference_status",
        "guardrail",
        "golden_path_steps",
        "production_build_status",
    }
    assert expected.issubset(body.keys())


@runtime_only
def test_inference_status_keys_match_frontend_contract(client: TestClient) -> None:
    body = client.get("/api/inference-status").json()
    expected = {
        "model_artifact",
        "model_backend",
        "inference_mode",
        "feature_source",
        "raw_source",
        "source_split",
        "rows_scored",
        "rows_ranked",
        "rows_displayed",
        "queue_limit",
        "no_cloud_call",
        "no_live_scraping",
        "no_retraining",
        "guardrail",
    }
    assert expected.issubset(body.keys())


@runtime_only
def test_queue_response_is_bounded_and_typed(client: TestClient) -> None:
    body = client.get("/api/queue", params={"top_n": 25}).json()
    assert {"summary", "distribution", "trend", "items", "inference_status", "guardrail"}.issubset(body)
    assert len(body["items"]) <= 25
    assert all({"label", "count"}.issubset(entry) for entry in body["distribution"])


@runtime_only
def test_archive_response_includes_split_distribution(client: TestClient) -> None:
    body = client.get("/api/archive", params={"page": 1, "page_size": 5}).json()
    keys = {
        "total_rows",
        "matched_count",
        "page",
        "page_size",
        "total_pages",
        "archive_scope",
        "heldout_rows",
        "train_rows",
        "split_distribution",
        "monthly_risk_trend",
        "date_range",
        "items",
        "inference_status",
        "guardrail",
    }
    assert keys.issubset(body.keys())
