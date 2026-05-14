
"""Tests for SQLite review store functionality."""

import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from src.reviews import (
    ReviewStore,
    REVIEW_STATUSES,
    DEFAULT_REVIEW_STATUS,
    _draft_review,
    _review_snapshots,
    _review_record,
    _review_list_item_from_queue,
    _review_counts,
)


def test_review_store_initialization():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        assert store.db_path == db_path


def test_draft_review():
    draft = _draft_review("CASE-TEST-001")
    assert draft["case_id"] == "CASE-TEST-001"
    assert draft["status"] == DEFAULT_REVIEW_STATUS
    assert draft["is_saved"] is False


def test_get_review_not_found():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        review = store.get_review("CASE-NOT-EXIST")
        assert review is None


def test_upsert_review_new():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        review = store.upsert_review(
            case_id="CASE-TEST-002",
            status="Perlu Review",
            reviewer_name="Test Reviewer",
            notes="Catatan test",
        )
        assert review["case_id"] == "CASE-TEST-002"
        assert review["status"] == "Perlu Review"
        assert review["reviewer_name"] == "Test Reviewer"
        assert review["notes"] == "Catatan test"
        assert len(review["history"]) == 1


def test_upsert_review_unknown_status_rejected():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        with pytest.raises(ValueError):
            store.upsert_review(
                case_id="CASE-TEST-003",
                status="Status Tidak Valid",
            )


def test_upsert_review_appends_history():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        store.upsert_review(
            case_id="CASE-TEST-004",
            status="Perlu Review",
        )
        review = store.upsert_review(
            case_id="CASE-TEST-004",
            status="Ditandai Risiko",
        )
        assert len(review["history"]) == 2


def test_upsert_signed_off_sets_timestamp():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        review = store.upsert_review(
            case_id="CASE-TEST-005",
            status="Selesai",
            signed_off=True,
        )
        assert review["signed_off_at"] is not None


def test_list_reviews():
    with TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        store = ReviewStore(db_path=db_path)
        store.upsert_review(case_id="CASE-001", status="Perlu Review")
        store.upsert_review(case_id="CASE-002", status="Ditandai Risiko")
        reviews = store.list_reviews()
        assert len(reviews) == 2


def test_review_snapshots():
    payload = {
        "metadata": {"package_title": "Test Paket"},
        "model_output": {"predicted_class": 2},
    }
    package_snapshot, model_snapshot = _review_snapshots(payload)
    assert package_snapshot["package_title"] == "Test Paket"
    assert model_snapshot["predicted_class"] == 2


def test_review_list_item_from_queue():
    row = {"case_id": "CASE-001", "package_title": "Test Paket", "risk_label": "Risiko Tinggi", "risk_rank": 1}
    item = _review_list_item_from_queue(row)
    assert item["case_id"] == "CASE-001"
    assert item["package_title"] == "Test Paket"


def test_review_counts():
    items = [
        {"status": "Perlu Review"},
        {"status": "Perlu Review"},
        {"status": "Ditandai Risiko"},
        {"status": "Selesai"},
    ]
    counts = _review_counts(items)
    assert counts["Perlu Review"] == 2
    assert counts["Ditandai Risiko"] == 1
    assert counts["Selesai"] == 1
