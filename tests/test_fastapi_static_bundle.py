"""SPA static-serving contract for `src/api.py`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import src.api as api_module
from src.api import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_root_returns_dist_missing_payload_when_unbuilt(client: TestClient) -> None:
    if api_module.FRONTEND_DIST.joinpath("index.html").exists():
        pytest.skip("frontend dist is present; this test only covers the missing case")
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["frontend_dist_missing"] is True
    assert "npm" in body["build_instruction"]
    assert body["api_ready"] is True
    assert "triase risiko" in body["guardrail"].lower()


def test_root_serves_index_when_dist_present(tmp_path: Path, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_dist = tmp_path / "dist"
    fake_dist.mkdir()
    (fake_dist / "index.html").write_text(
        "<!doctype html><html><body>LPSE-X SPA</body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(api_module, "FRONTEND_DIST", fake_dist)
    monkeypatch.setattr(api_module, "ASSETS_DIR", fake_dist / "assets")

    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "LPSE-X SPA" in response.text


def test_spa_fallback_serves_index_for_unknown_route(tmp_path: Path, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_dist = tmp_path / "dist"
    fake_dist.mkdir()
    (fake_dist / "index.html").write_text(
        "<!doctype html><html><body>LPSE-X SPA</body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(api_module, "FRONTEND_DIST", fake_dist)
    monkeypatch.setattr(api_module, "ASSETS_DIR", fake_dist / "assets")

    response = client.get("/command-center")
    assert response.status_code == 200
    assert "LPSE-X SPA" in response.text


def test_api_routes_not_swallowed_by_spa(client: TestClient) -> None:
    response = client.get("/api/not-real-route")
    assert response.status_code == 404
    body = json.loads(response.content.decode("utf-8"))
    assert "Unknown API route" in body["detail"]


def test_assets_path_returns_404_when_missing(client: TestClient) -> None:
    response = client.get("/assets/does-not-exist.js")
    assert response.status_code == 404
