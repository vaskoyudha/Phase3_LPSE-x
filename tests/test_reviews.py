from fastapi.testclient import TestClient

from src import api as api_module
from src.api import app


client = TestClient(app)


def _use_temp_review_db(monkeypatch, tmp_path):
    db_path = tmp_path / "reviews.sqlite3"
    monkeypatch.setattr(api_module, "REVIEW_DB_PATH", db_path, raising=False)
    if hasattr(api_module, "_review_store"):
        api_module._review_store.cache_clear()
    return db_path


def test_review_endpoint_returns_casebook_prefilled_draft_without_saved_record(monkeypatch, tmp_path):
    _use_temp_review_db(monkeypatch, tmp_path)
    demo_state = client.get("/api/demo-state").json()
    case_id = demo_state["demo_case_id"]

    response = client.get(f"/api/reviews/{case_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["case_id"] == case_id
    assert payload["is_saved"] is False
    assert payload["status"] == "Perlu Review"
    assert payload["prefill"]["rationale"]
    assert payload["prefill"]["checklist"]
    assert payload["model_snapshot"]["predicted_label"]
    assert payload["guardrail"].startswith("Output LPSE-X")


def test_review_upsert_saves_human_signoff_and_appends_history(monkeypatch, tmp_path):
    _use_temp_review_db(monkeypatch, tmp_path)
    case_id = client.get("/api/demo-state").json()["demo_case_id"]

    response = client.put(
        f"/api/reviews/{case_id}",
        json={
            "status": "Ditandai Risiko",
            "reviewer_name": "Vasco Yudha",
            "notes": "Perlu eskalasi karena checklist awal perlu dibuktikan.",
            "decision_summary": "Eskalasi untuk verifikasi dokumen pendukung.",
            "signed_off": True,
        },
    )

    assert response.status_code == 200
    saved = response.json()
    assert saved["case_id"] == case_id
    assert saved["is_saved"] is True
    assert saved["status"] == "Ditandai Risiko"
    assert saved["reviewer_name"] == "Vasco Yudha"
    assert saved["signed_off_at"]
    assert saved["event_count"] == 1

    reread = client.get(f"/api/reviews/{case_id}").json()
    assert reread["is_saved"] is True
    assert reread["notes"] == "Perlu eskalasi karena checklist awal perlu dibuktikan."
    assert reread["history"][0]["status"] == "Ditandai Risiko"

    listing = client.get("/api/reviews?status=Ditandai%20Risiko").json()
    assert listing["counts"]["Ditandai Risiko"] == 1
    assert listing["items"][0]["case_id"] == case_id
    assert listing["items"][0]["is_saved"] is True


def test_review_list_paginates_priority_queue(monkeypatch, tmp_path):
    _use_temp_review_db(monkeypatch, tmp_path)

    response = client.get("/api/reviews?page=2&page_size=2&top_n=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 2
    assert payload["page_size"] == 2
    assert payload["total_items"] == 5
    assert payload["total_pages"] == 3
    assert len(payload["items"]) == 2
    assert payload["items"][0]["case_id"] != payload["items"][1]["case_id"]


def test_review_upsert_rejects_unknown_status(monkeypatch, tmp_path):
    _use_temp_review_db(monkeypatch, tmp_path)
    case_id = client.get("/api/demo-state").json()["demo_case_id"]

    response = client.put(f"/api/reviews/{case_id}", json={"status": "Accused", "reviewer_name": "Vasco"})

    assert response.status_code == 422
