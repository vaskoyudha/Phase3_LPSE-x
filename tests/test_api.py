"""Backend Person 2 API contract tests.

These tests cover the FastAPI surface that wraps the LPSE-X ML primitives.
They run against the real cached held-out runtime when the ML dependencies
and model artifacts are available; otherwise the heavy cases skip rather
than fail, so the bare-checkout smoke (compile + light contract) still
passes anywhere.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import src.api as api_module
from src.api import app
from src.api_schemas import (
    ArchiveBrowserResponse,
    DatasetBrowserResponse,
    DemoStateResponse,
    HealthResponse,
    InferenceStatus,
    QueueResponse,
)


EXPECTED_HELD_OUT_ROWS = 93034
EXPECTED_TRAIN_ROWS = 372150
EXPECTED_ARCHIVE_ROWS = EXPECTED_HELD_OUT_ROWS + EXPECTED_TRAIN_ROWS

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
    reason="held-out parquet, model_risk.ubj, or xgboost not available",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Light contract checks (no runtime needed)
# ---------------------------------------------------------------------------


def test_health_returns_offline_guardrail_contract(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = HealthResponse.model_validate(response.json())
    assert payload.ok is True
    assert payload.mode == "offline_local"
    assert "triase risiko" in payload.guardrail.lower()


def test_queue_top_n_validation_rejects_zero(client: TestClient) -> None:
    response = client.get("/api/queue", params={"top_n": 0})
    assert response.status_code == 422


def test_queue_top_n_validation_rejects_above_max(client: TestClient) -> None:
    response = client.get("/api/queue", params={"top_n": 501})
    assert response.status_code == 422


def test_dataset_page_size_validation_rejects_above_max(client: TestClient) -> None:
    response = client.get("/api/dataset", params={"page_size": 101})
    assert response.status_code == 422


def test_archive_split_validation(client: TestClient) -> None:
    response = client.get("/api/archive", params={"split": "invalid"})
    assert response.status_code == 422


def test_archive_sort_validation(client: TestClient) -> None:
    response = client.get("/api/archive", params={"sort": "alphabetical"})
    assert response.status_code == 422


def test_static_casebook_status_is_secondary(client: TestClient) -> None:
    response = client.get("/api/static-casebook")
    assert response.status_code == 200
    body = response.json()
    assert body["primary_export"] is False
    assert "triase risiko" in body["guardrail"].lower()


def test_unknown_api_route_returns_json_404(client: TestClient) -> None:
    response = client.get("/api/not-a-real-route")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


# ---------------------------------------------------------------------------
# Runtime-backed contract checks
# ---------------------------------------------------------------------------


@runtime_only
def test_demo_state_is_ready_with_known_artifact(client: TestClient) -> None:
    response = client.get("/api/demo-state")
    assert response.status_code == 200
    state = DemoStateResponse.model_validate(response.json())
    assert state.ready is True
    assert state.offline_mode is True
    assert state.model_artifact == "model_risk.ubj"
    assert state.feature_source == "test_data/features.parquet"
    assert state.raw_source == "test_data/raw.parquet"
    assert state.demo_case_id is not None
    assert state.casebook_url and state.casebook_url.endswith(state.demo_case_id)
    assert state.export_html_url and state.export_html_url.endswith("export.html")
    assert state.inference_status is not None
    assert state.inference_status.no_cloud_call is True
    assert state.inference_status.no_live_scraping is True
    assert state.inference_status.no_retraining is True


@runtime_only
def test_inference_status_proves_held_out(client: TestClient) -> None:
    response = client.get("/api/inference-status")
    assert response.status_code == 200
    status = InferenceStatus.model_validate(response.json())
    assert status.source_split == "test_data"
    assert status.feature_source == "test_data/features.parquet"
    assert status.rows_scored == EXPECTED_HELD_OUT_ROWS
    assert status.queue_limit == 50
    assert status.no_retraining is True


@runtime_only
def test_queue_top_n_one_returns_one_item(client: TestClient) -> None:
    response = client.get("/api/queue", params={"top_n": 1})
    assert response.status_code == 200
    queue = QueueResponse.model_validate(response.json())
    assert len(queue.items) == 1
    assert queue.inference_status.rows_scored == EXPECTED_HELD_OUT_ROWS
    assert queue.guardrail.lower().startswith("output lpse-x")


@runtime_only
def test_dataset_returns_paginated_held_out_rows(client: TestClient) -> None:
    response = client.get("/api/dataset", params={"page": 1, "page_size": 12})
    assert response.status_code == 200
    payload = DatasetBrowserResponse.model_validate(response.json())
    assert payload.page == 1
    assert payload.page_size == 12
    assert len(payload.items) == 12
    assert payload.total_rows == EXPECTED_HELD_OUT_ROWS
    assert payload.inference_status.source_split == "test_data"


@runtime_only
def test_archive_returns_split_labels(client: TestClient) -> None:
    response = client.get(
        "/api/archive", params={"page": 1, "page_size": 5, "split": "train_data"}
    )
    assert response.status_code == 200
    payload = ArchiveBrowserResponse.model_validate(response.json())
    assert len(payload.items) == 5
    for row in payload.items:
        assert row["source_split"] == "train_data"
        assert row["eval_claim_scope"] == "archive_browsing_only"
    assert payload.train_rows == EXPECTED_TRAIN_ROWS
    assert payload.heldout_rows == EXPECTED_HELD_OUT_ROWS


@runtime_only
def test_archive_test_split_is_held_out_only(client: TestClient) -> None:
    response = client.get(
        "/api/archive", params={"page": 1, "page_size": 1, "split": "test_data"}
    )
    assert response.status_code == 200
    payload = ArchiveBrowserResponse.model_validate(response.json())
    assert payload.items
    row = payload.items[0]
    assert row["source_split"] == "test_data"
    assert row["eval_claim_scope"] == "heldout_test_only"


@runtime_only
def test_archive_analytics_is_bounded(client: TestClient) -> None:
    response = client.get("/api/archive/analytics")
    assert response.status_code == 200
    body = response.json()
    assert body["priority_map_meta"]["point_limit"] == 500
    assert len(body["priority_map"]) <= 500
    assert len(body["regional_concentration"]) <= 12
    assert len(body["buyer_concentration"]) <= 12
    assert "triase risiko" in body["guardrail"].lower()


@runtime_only
def test_casebook_returns_selected_case(client: TestClient) -> None:
    state = client.get("/api/demo-state").json()
    case_id = state["demo_case_id"]
    response = client.get(f"/api/casebook/{case_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["case_id"] == case_id
    assert payload["model_output"]["predicted_label"]
    assert payload["factors"]
    assert payload["provenance"]["model_artifact"].endswith("model_risk.ubj")


@runtime_only
def test_casebook_export_html_disclosure(client: TestClient) -> None:
    state = client.get("/api/demo-state").json()
    case_id = state["demo_case_id"]
    response = client.get(f"/api/casebook/{case_id}/export.html")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    body = response.text
    assert "LPSE-X-SELECTED-EXPORT" in body
    assert f"requested_case_id={case_id}" in body
    assert "model_risk.ubj" in body
    assert "Reviewer Checklist" in body
    assert "Top Risk Factors" in body


@runtime_only
def test_model_artifact_mtime_unchanged_after_calls(client: TestClient) -> None:
    artifact = MODEL_ARTIFACT
    before = artifact.stat().st_mtime
    client.get("/api/health")
    client.get("/api/inference-status")
    client.get("/api/queue", params={"top_n": 5})
    client.get("/api/dataset", params={"page": 1, "page_size": 5})
    after = artifact.stat().st_mtime
    assert before == after
