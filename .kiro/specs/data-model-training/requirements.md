# Requirements Document

## Introduction

This document specifies the requirements for the "Backend Person 1: Data, Features, Labels, Training, Artifacts" module of the LPSE-X procurement risk scoring system. The module owns the model and data foundation: parquet split contracts, feature/label generation, model artifacts, inference runtime primitives, and smoke tests. It produces deterministic Python primitives consumed by the API layer without implementing FastAPI itself.

## Glossary

- **Artifact_Resolver**: The module (`src/artifacts.py`) responsible for locating accepted model files on disk without retraining or regenerating them.
- **Feature_Engine**: The module (`src/features.py`) that transforms raw procurement data into numeric feature columns for model consumption.
- **Label_Generator**: The module (`src/labels.py`) that computes heuristic risk labels and red-flag indicators from raw procurement data.
- **Model_Lifecycle**: The module (`src/model.py`) containing training, HPO, calibration, evaluation, and export utilities.
- **Prediction_Backend**: The runtime adapter (`src/product_demo.py`) that loads a trained model, aligns features, scores risk probabilities, and builds ranked queues.
- **Split_Manager**: The module (`src/split.py`) that enforces temporal train/test boundaries and internal development sub-splits.
- **Inference_Smoke**: The script (`scripts/inference_smoke.py`) that proves local offline inference works end-to-end.
- **PROJECT_ROOT**: The root directory of the repository, resolved as `Path(__file__).resolve().parents[1]` from any `src/` module.
- **UBJ**: Universal Binary JSON format used by XGBoost for model serialization (`model_risk.ubj`).
- **ONNX**: Open Neural Network Exchange format for portable model inference (`model_risk.onnx`).
- **Held-out Split**: The `test_data/` partition used exclusively for final evaluation, never for training or tuning.
- **Risk_Priority_Score**: A composite score combining predicted probability and heuristic flags used to rank the risk queue.

## Requirements

### Requirement 1: Artifact Path Resolution

**User Story:** As a runtime consumer, I want a single resolver that locates accepted model artifacts, so that inference always uses submitted models without regeneration.

#### Acceptance Criteria

1.1. THE Artifact_Resolver SHALL define PROJECT_ROOT as `Path(__file__).resolve().parents[1]`.

1.2. THE Artifact_Resolver SHALL accept exactly two artifact kinds: UBJ (`model_risk.ubj`) and ONNX (`model_risk.onnx`).

1.3. WHEN `resolve_model_artifact(kind, explicit_path, project_root)` is called with a valid kind, THE Artifact_Resolver SHALL return the resolved absolute path of an existing artifact file.

1.4. WHEN `resolve_model_artifact` is called with an explicit_path that exists, THE Artifact_Resolver SHALL prefer that path over default locations.

1.5. IF a legacy fallback path (e.g., `models/xgb_model.ubj` or `models/xgb_model.onnx`) is the only file present, THEN THE Artifact_Resolver SHALL raise a FileNotFoundError.

1.6. IF no accepted artifact file exists at any candidate location, THEN THE Artifact_Resolver SHALL raise a FileNotFoundError with a message listing all checked paths.

### Requirement 2: Split-Data Contract

**User Story:** As a data scientist, I want enforced train/test split boundaries, so that held-out evaluation integrity is preserved.

#### Acceptance Criteria

2.1. THE Split_Manager SHALL read from `train_data/` and `test_data/` directories, each containing `raw.parquet`, `features.parquet`, and `labels.parquet`.

2.2. THE Split_Manager SHALL enforce temporal ordering such that `max(train[date_col]) < min(test[date_col])`.

2.3. WHEN internal development sub-splits are created, THE Split_Manager SHALL partition only within `train_data` into `train_fit`, `val_hpo`, and `val_calibration`.

2.4. THE Split_Manager SHALL prevent any HPO, calibration, or threshold tuning operation from inspecting `test_data`.

2.5. WHEN `load_raw_split(partition)` is called with an invalid partition name, THE Split_Manager SHALL raise a ValueError.

### Requirement 3: Feature Engineering

**User Story:** As a model consumer, I want stable numeric features generated from raw procurement data, so that model inference produces consistent results.

#### Acceptance Criteria

3.1. THE Feature_Engine SHALL implement helper functions: `_to_numeric`, `_safe_log1p`, `_safe_len`, `_safe_token_count`, and `_parse_dates`.

3.2. THE Feature_Engine SHALL implement `tier1_features` covering tender value scale, log amount, price deviation ratios, title/description length, and token counts.

3.3. THE Feature_Engine SHALL implement `tier2_features` covering procurement method flags, timing flags, date-derived features, buyer/supplier repeat interactions, recent supplier activity, and buyer value spike features.

3.4. WHEN `compute_all_features` is called, THE Feature_Engine SHALL produce a DataFrame where all columns are numeric dtype.

3.5. THE Feature_Engine SHALL produce feature columns whose names match those expected by `model_risk.ubj` as stored in `test_data/features.parquet`.

3.6. IF a model-required feature name is missing from the computed features at inference time, THEN THE Prediction_Backend SHALL raise a ValueError with a clear error message listing missing features.

3.7. WHEN `save_features` is called with a partition name, THE Feature_Engine SHALL write the features DataFrame to `{partition}_data/features.parquet`.

### Requirement 4: Heuristic Labels and Red Flags

**User Story:** As a risk analyst, I want heuristic risk labels derived from procurement patterns, so that the model can be trained on interpretable risk signals.

#### Acceptance Criteria

4.1. THE Label_Generator SHALL implement flag functions: `flag_single_bidder`, `flag_short_title`, `flag_short_description`, `flag_q4_timing`, `flag_price_deviation`, `flag_high_value`, `flag_repeat_pair_history`, `flag_supplier_recent_surge`, `flag_buyer_value_spike`, and `flag_direct_procurement`.

4.2. WHEN `compute_red_flags` is called, THE Label_Generator SHALL return a DataFrame containing all individual flag columns.

4.3. WHEN `compute_risk_labels` is called, THE Label_Generator SHALL produce a risk label column derived from the combination of red flags.

4.4. WHEN `save_labels` is called with a partition name, THE Label_Generator SHALL write the labels DataFrame to `{partition}_data/labels.parquet`.

4.5. THE Label_Generator SHALL document that labels are heuristic risk indicators, not verified fraud or legal findings.

### Requirement 5: Model Lifecycle Utilities

**User Story:** As a model developer, I want training, evaluation, and export utilities separated from product runtime, so that runtime code never triggers retraining.

#### Acceptance Criteria

5.1. THE Model_Lifecycle SHALL implement `train_xgboost` to train an XGBoost classifier from features and labels.

5.2. THE Model_Lifecycle SHALL implement `run_hpo` to perform Optuna hyperparameter optimization using only training/dev splits.

5.3. THE Model_Lifecycle SHALL implement `compute_class_weights` and `compute_sample_weights` for handling class imbalance.

5.4. THE Model_Lifecycle SHALL implement `fit_temperature` for probability calibration.

5.5. THE Model_Lifecycle SHALL implement `evaluate` to compute macro-F1, accuracy, log loss, and confusion matrix metrics.

5.6. THE Model_Lifecycle SHALL implement `save_model` and `load_model` for UBJ serialization.

5.7. THE Model_Lifecycle SHALL implement `export_onnx` and `check_onnx_parity` to export ONNX format and verify numerical equivalence.

5.8. WHILE product runtime code is executing, THE Model_Lifecycle training functions (those calling `.fit()`) SHALL NOT be invoked.

5.9. THE Model_Lifecycle SHALL use only `train_data` and its internal dev splits for HPO and calibration; `test_data` SHALL be used for final evaluation only.

### Requirement 6: Offline Prediction Backend

**User Story:** As an API consumer, I want a runtime-safe prediction adapter that scores local feature rows and builds ranked queues, so that the API can serve risk assessments without retraining.

#### Acceptance Criteria

6.1. THE Prediction_Backend SHALL implement `PredictionBackend` class with `align_features` and `predict_proba` methods.

6.2. WHEN `align_features` is called, THE Prediction_Backend SHALL require exact model feature names and raise a ValueError if any are missing.

6.3. THE Prediction_Backend SHALL implement `load_prediction_backend` to load a model artifact and return a configured PredictionBackend instance.

6.4. THE Prediction_Backend SHALL implement `load_demo_dataset` to load features and raw data from `test_data/`.

6.5. WHEN `build_inference_run(max_rows=None, top_n=None)` is called, THE Prediction_Backend SHALL score the entire held-out test split (93,034 rows).

6.6. THE Prediction_Backend SHALL implement `build_risk_queue` that sorts results by `risk_priority_score` in descending order.

6.7. THE Prediction_Backend SHALL implement `build_archive_inference_run` that combines `train_data` and `test_data` for archive browsing with `source_split`, `is_heldout`, and `eval_claim_scope` labels.

6.8. THE Prediction_Backend SHALL report `InferenceRunMetadata` including `model_artifact`, `inference_mode`, `source_split`, `rows_scored`, `no_cloud_call`, `no_live_scraping`, and `no_retraining` flags.

6.9. WHEN archive rows originate from `train_data`, THE Prediction_Backend SHALL set `eval_claim_scope` to `archive_browsing_only`.

6.10. WHEN archive rows originate from `test_data`, THE Prediction_Backend SHALL set `eval_claim_scope` to `heldout_test_only`.

### Requirement 7: Inference Smoke Script

**User Story:** As a judge/reviewer, I want a single command that proves local inference works, so that I can verify the system operates offline without cloud dependencies.

#### Acceptance Criteria

7.1. WHEN `scripts/inference_smoke.py` is executed, THE Inference_Smoke SHALL load `model_risk.ubj` and score all rows in `test_data/features.parquet`.

7.2. WHEN scoring completes, THE Inference_Smoke SHALL build a Top 50 risk queue and print a JSON summary.

7.3. THE Inference_Smoke JSON output SHALL contain keys: `latency_ms`, `model`, `rank_1`, `rows_displayed`, and `rows_scored`.

7.4. THE Inference_Smoke SHALL assert that `rows_scored` equals 93,034.

7.5. THE Inference_Smoke SHALL assert metadata flags: `no_cloud_call=True`, `no_live_scraping=True`, `no_retraining=True`.

### Requirement 8: Model-Only Guardrail Tests

**User Story:** As a project maintainer, I want automated guardrail tests that prevent runtime safety regressions, so that the ML-only repo stays clean of backend/frontend code and training calls.

#### Acceptance Criteria

8.1. THE guardrail tests SHALL verify that product runtime surfaces (`src/artifacts.py`, `src/product_demo.py`, `src/casebook.py`) do not contain training or scraping API calls.

8.2. THE guardrail tests SHALL verify that `inference.ipynb` uses submitted artifacts (`model_risk.ubj`, `model_risk.onnx`) and `test_data` paths.

8.3. THE guardrail tests SHALL verify that backend/frontend implementation files (`src/api.py`, `src/api_schemas.py`, `src/reviews.py`, `frontend/`, `app.py`, `package.json`) are absent from the ML-only repo.

8.4. THE guardrail tests SHALL verify that `requirements.txt` excludes backend/frontend runtime packages (`fastapi`, `uvicorn`, `streamlit`).

8.5. IF any guardrail violation is detected, THEN THE guardrail tests SHALL fail with a descriptive assertion message.
