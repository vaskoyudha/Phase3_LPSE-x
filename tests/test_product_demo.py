from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from src.product_demo import (
    DEFAULT_FEATURES_PATH,
    HEURISTIC_LABEL_NOTE_ID,
    SAFE_GUARDRAIL_ID,
    PredictionBackend,
    build_archive_inference_run,
    build_inference_run,
    build_risk_queue,
    load_demo_dataset,
    load_prediction_backend,
    predict_risk_scores,
)

EXPECTED_HELD_OUT_ROWS = 93034


class FakeModel:
    pass


class FakeBackend(PredictionBackend):
    def __init__(self, feature_names):
        super().__init__("fake", Path(__file__), FakeModel(), list(feature_names))

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        aligned = self.align_features(features)
        base = np.linspace(0.15, 0.85, len(aligned))
        return np.column_stack([1 - base, base / 2, base / 2])


def test_demo_dataset_uses_local_test_split_only():
    dataset = load_demo_dataset(max_rows=5)

    assert dataset.max_rows == 5
    assert len(dataset.features) == len(dataset.raw) == 5
    assert "test_data/features.parquet" in dataset.feature_path.as_posix()
    assert "test_data/raw.parquet" in dataset.raw_path.as_posix()


def test_prediction_backend_requires_exact_feature_alignment():
    dataset = load_demo_dataset(max_rows=3)
    backend = load_prediction_backend()
    missing_one = dataset.features.drop(columns=[backend.feature_names[0]])

    with pytest.raises(ValueError, match="missing model feature"):
        backend.align_features(missing_one)


def test_product_demo_queue_preserves_guardrails_and_priority_order():
    dataset = load_demo_dataset(max_rows=4)
    backend = FakeBackend(dataset.features.columns[:3])
    predictions = predict_risk_scores(dataset.features.iloc[:, :3], backend)
    queue = build_risk_queue(dataset, predictions, top_n=4)

    assert list(queue["risk_rank"]) == [1, 2, 3, 4]
    assert queue["risk_priority_score"].is_monotonic_decreasing
    assert "triase risiko" in SAFE_GUARDRAIL_ID
    assert "prioritas review" in SAFE_GUARDRAIL_ID
    assert "bukan tuduhan pelanggaran" in SAFE_GUARDRAIL_ID
    assert "heuristik" in HEURISTIC_LABEL_NOTE_ID


def test_inference_run_metadata_reports_offline_runtime_without_caps():
    dataset, _, predictions, queue, metadata = build_inference_run(max_rows=8, top_n=3)

    assert len(dataset.features) == 8
    assert len(predictions) == 8
    assert len(queue) == 3
    assert metadata.model_artifact == "model_risk.ubj"
    assert metadata.inference_mode == "offline_local"
    assert metadata.source_split == "test_data"
    assert metadata.rows_scored == 8
    assert metadata.rows_ranked == 8
    assert metadata.rows_displayed == 3
    assert metadata.queue_limit == 3
    assert metadata.loaded_rows_cap == 8
    assert metadata.no_cloud_call is True
    assert metadata.no_live_scraping is True
    assert metadata.no_retraining is True
    assert metadata.total_latency_ms > 0


def test_full_inference_scores_expected_split_and_bounds_display_queue():
    dataset, _, predictions, queue, metadata = build_inference_run(max_rows=None, top_n=50)

    assert len(pd.read_parquet(DEFAULT_FEATURES_PATH)) == EXPECTED_HELD_OUT_ROWS
    assert len(dataset.features) == EXPECTED_HELD_OUT_ROWS
    assert len(predictions) == EXPECTED_HELD_OUT_ROWS
    assert len(queue) == 50
    assert metadata.rows_scored == EXPECTED_HELD_OUT_ROWS
    assert metadata.rows_ranked == EXPECTED_HELD_OUT_ROWS
    assert metadata.rows_displayed == 50
    assert metadata.queue_limit == 50
    assert metadata.loaded_rows_cap is None


def test_archive_inference_run_scores_split_labeled_local_archive_with_fake_backend(monkeypatch):
    dataset = load_demo_dataset(max_rows=3)
    fake_backend = FakeBackend(dataset.features.columns[:3])
    monkeypatch.setattr('src.product_demo.load_prediction_backend', lambda: fake_backend)

    backend, archive_queue, metadata = build_archive_inference_run(max_rows_per_split=3)

    assert backend is fake_backend
    assert metadata.archive_scope == 'all_local_prepared_data'
    assert metadata.rows_scored == 6
    assert metadata.train_rows == 3
    assert metadata.heldout_rows == 3
    assert set(metadata.source_splits) == {'train_data', 'test_data'}
    assert len(archive_queue) == 6
    assert set(archive_queue['source_split']) == {'train_data', 'test_data'}
    assert set(archive_queue['eval_claim_scope']) == {'archive_browsing_only', 'heldout_test_only'}
    assert archive_queue['archive_id'].str.startswith(('train_data:', 'test_data:')).all()
    for column in ('buyer_region', 'buyer_region_type', 'buyer_region_source', 'buyer_region_note'):
        assert column in archive_queue.columns
    assert set(archive_queue['buyer_region_source']) == {'derived_from_buyer_name'}
    assert archive_queue['buyer_region'].notna().all()
    assert archive_queue['buyer_region_note'].astype(str).str.len().gt(0).all()
    assert archive_queue['archive_rank'].tolist() == list(range(1, 7))
    assert archive_queue['risk_priority_score'].is_monotonic_decreasing
    assert 'Full Archive' in metadata.display_note
    assert metadata.no_retraining is True
