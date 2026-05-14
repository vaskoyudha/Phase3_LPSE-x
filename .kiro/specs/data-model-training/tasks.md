# Implementation Plan: Data, Features, Labels, Training, Artifacts

## Overview

Implement the model and data foundation for LPSE-X: artifact resolution, split contracts, feature/label generation, model lifecycle utilities, offline prediction backend, inference smoke script, and guardrail tests. All code is Python; no web framework is involved. Each task builds on previous tasks following the dependency DAG.

## Tasks

- [x] 1. Lock project constants and artifact paths
  - [x] 1.1 Implement `src/artifacts.py` with PROJECT_ROOT, ArtifactKind, and resolve_model_artifact
    - Define `PROJECT_ROOT = Path(__file__).resolve().parents[1]`
    - Define `_ACCEPTED_ARTIFACTS` mapping for UBJ and ONNX kinds
    - Implement `resolve_model_artifact(kind, explicit_path, project_root)` with search order: explicit → accepted root
    - Reject legacy fallback paths (`models/xgb_model.*`)
    - Raise `FileNotFoundError` with checked paths when no artifact found
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.2 Write property tests for artifact resolution
    - **Property 1: Artifact resolver returns existing absolute paths**
    - **Property 2: Explicit path preference**
    - **Property 3: Empty project root raises FileNotFoundError with checked paths**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**

  - [x] 1.3 Write unit tests in `tests/test_artifacts.py`
    - Test submitted artifacts resolve without regeneration
    - Test UBJ backend loads feature names
    - Test legacy model fallback is rejected
    - Test ONNX backend reuses feature order
    - _Requirements: 1.2, 1.3, 1.5_

- [x] 2. Preserve split-data contract
  - [x] 2.1 Implement `src/split.py` with temporal split logic
    - Define `TRAIN_DIR` and `TEST_DIR` paths
    - Implement `external_raw_split` with temporal ordering guarantee
    - Implement `internal_dev_splits` partitioning only within train_data
    - Implement `load_raw_split` with ValueError for invalid partitions
    - Implement `save_raw_splits` and `save_dev_split_manifest`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property tests for split contract
    - **Property 4: Temporal split ordering invariant**
    - **Property 5: Internal dev splits stay within train boundaries**
    - **Property 6: Invalid partition raises ValueError**
    - **Validates: Requirements 2.2, 2.3, 2.5**

- [x] 3. Checkpoint - Verify foundation modules
  - Ensure `pytest tests/test_artifacts.py -q` passes
  - Verify `train_data/` and `test_data/` contain expected parquet files
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Feature engineering module
  - [x] 4.1 Implement `src/features.py` helper functions
    - Implement `_to_numeric`, `_safe_log1p`, `_safe_len`, `_safe_token_count`, `_parse_dates`
    - All helpers must handle None/NaN gracefully and return numeric Series
    - _Requirements: 3.1_

  - [x] 4.2 Implement tier1_features and tier2_features
    - `tier1_features`: tender value scale, log amount, price deviation ratios, title/desc length, token counts
    - `tier2_features`: procurement method flags, timing flags, date features, buyer/supplier interactions, supplier activity, buyer value spikes
    - _Requirements: 3.2, 3.3_

  - [x] 4.3 Implement compute_all_features and save_features
    - `compute_all_features` combines tier1 + tier2, ensures all columns are numeric
    - `save_features` writes to `{partition}_data/features.parquet`
    - Feature names must match those expected by `model_risk.ubj`
    - _Requirements: 3.4, 3.5, 3.7_

  - [ ]* 4.4 Write property test for feature numeric invariant
    - **Property 7: Feature output is all-numeric**
    - **Validates: Requirements 3.4**

- [x] 5. Heuristic labels and red flags
  - [x] 5.1 Implement `src/labels.py` flag functions
    - Implement all 10 flag functions: `flag_single_bidder`, `flag_short_title`, `flag_short_description`, `flag_q4_timing`, `flag_price_deviation`, `flag_high_value`, `flag_repeat_pair_history`, `flag_supplier_recent_surge`, `flag_buyer_value_spike`, `flag_direct_procurement`
    - Each flag returns a binary (0/1) pd.Series
    - _Requirements: 4.1_

  - [x] 5.2 Implement compute_red_flags, compute_risk_labels, and save_labels
    - `compute_red_flags` returns DataFrame with all flag columns
    - `compute_risk_labels` derives risk_label from combined flags
    - `save_labels` writes to `{partition}_data/labels.parquet`
    - Include heuristic disclaimer documentation
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.3 Write property tests for labels
    - **Property 9: Red flags output contains all flag columns**
    - **Property 10: Risk labels are derived from red flags**
    - **Property 11: Labels round-trip through parquet**
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [x] 6. Model lifecycle utilities
  - [x] 6.1 Implement `src/model.py` training and evaluation functions
    - Implement `load_train_artifacts`, `load_test_artifacts`, `load_dev_split_indices`
    - Implement `train_xgboost` with XGBoost classifier training
    - Implement `run_hpo` with Optuna on train/dev splits only
    - Implement `compute_class_weights` and `compute_sample_weights`
    - _Requirements: 5.1, 5.2, 5.3, 5.9_

  - [x] 6.2 Implement calibration, metrics, and export functions
    - Implement `fit_temperature` for probability calibration
    - Implement `evaluate` computing macro-F1, accuracy, log loss, confusion matrix
    - Implement `save_model`, `load_model` for UBJ serialization
    - Implement `export_onnx` and `check_onnx_parity`
    - Implement `save_metrics` and `save_decision_thresholds`
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.3 Write unit tests for model lifecycle
    - Test that training functions use only train splits
    - Test ONNX export produces numerically equivalent predictions
    - Test evaluation metrics are computed correctly on small synthetic data
    - _Requirements: 5.8, 5.9_

- [x] 7. Checkpoint - Verify feature/label/model pipeline
  - Run `python -m compileall src` to verify no syntax errors
  - Ensure feature columns in `test_data/features.parquet` match model expectations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Offline prediction backend
  - [x] 8.1 Implement PredictionBackend class and loaders
    - Implement `PredictionBackend` with `align_features` (raises ValueError on missing features) and `predict_proba`
    - Implement `load_prediction_backend` factory function
    - Implement `load_demo_dataset` and `load_split_dataset` reading from test_data/
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Implement build_inference_run and build_risk_queue
    - `build_inference_run(max_rows=None, top_n=None)` scores entire held-out split
    - `build_risk_queue` sorts by `risk_priority_score` descending, assigns `risk_rank`
    - Return `InferenceRunMetadata` with all required fields and guardrail flags
    - _Requirements: 6.5, 6.6, 6.8_

  - [x] 8.3 Implement build_archive_inference_run
    - Combine train_data and test_data for archive browsing
    - Add `source_split`, `is_heldout`, `eval_claim_scope` labels
    - Set `eval_claim_scope = "archive_browsing_only"` for train rows
    - Set `eval_claim_scope = "heldout_test_only"` for test rows
    - Return `ArchiveInferenceMetadata` with split counts
    - _Requirements: 6.7, 6.9, 6.10_

  - [ ]* 8.4 Write property tests for prediction backend
    - **Property 8: Missing feature detection**
    - **Property 12: Risk queue is sorted by priority score descending**
    - **Property 13: Archive split labeling correctness**
    - **Property 14: Inference metadata completeness**
    - **Validates: Requirements 3.6, 6.2, 6.6, 6.8, 6.9, 6.10**

  - [x] 8.5 Write unit tests in `tests/test_product_demo.py`
    - Test demo dataset uses local test split only
    - Test prediction backend requires exact feature alignment
    - Test queue preserves guardrails and priority order
    - Test inference run metadata reports offline runtime
    - Test full inference scores expected 93,034 rows
    - Test archive inference run with split labels
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7, 6.8_

- [x] 9. Inference smoke script
  - [x] 9.1 Implement `scripts/inference_smoke.py`
    - Load `model_risk.ubj` via `build_inference_run(max_rows=None, top_n=50)`
    - Score all `test_data/features.parquet` rows
    - Build Top 50 queue
    - Print JSON summary with keys: `latency_ms`, `model`, `rank_1`, `rows_displayed`, `rows_scored`
    - Assert `rows_scored == 93034`
    - Assert `no_cloud_call`, `no_live_scraping`, `no_retraining` metadata flags
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10. Model-only guardrail tests
  - [x] 10.1 Implement `tests/test_no_retraining.py`
    - Verify product runtime surfaces do not contain `.fit(`, `optuna.create_study`, `requests.get`, `requests.post`, scraping calls, or file-write calls
    - Verify README/PROJECT_GUIDELINES document offline/no-cloud/no-retraining boundaries
    - _Requirements: 8.1_

  - [x] 10.2 Implement `tests/test_inference_readiness_contract.py`
    - Verify `inference.ipynb` uses `model_risk.ubj`, `model_risk.onnx`, `test_data/features.parquet`
    - Verify notebook does not reference legacy paths or call `.fit(`
    - Verify backend/frontend files are absent from ML-only repo
    - Verify `requirements.txt` excludes `fastapi`, `uvicorn`, `streamlit`
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [x] 11. Final checkpoint - Full acceptance verification
  - Run `python -m compileall src tests scripts`
  - Run `pytest tests/test_artifacts.py tests/test_product_demo.py tests/test_inference_readiness_contract.py tests/test_no_retraining.py`
  - Run `PYTHONPATH=. python scripts/inference_smoke.py`
  - Verify smoke script outputs valid JSON with `rows_scored: 93034`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- The dependency order is: 1 → 2 → 4 → 5 → 6 → 8 → 9 → 10 → 11
- Task 6 (model lifecycle) depends on both Task 4 (features) and Task 5 (labels)
- Task 8 (prediction backend) depends on Tasks 1, 4, and 6
- Checkpoints (Tasks 3, 7, 11) ensure incremental validation
- All code is Python; the detected dominant language is Python
- Product runtime files (`src/artifacts.py`, `src/product_demo.py`) must never call `.fit()`
- Commit messages must be in Bahasa Indonesia per project guidelines
