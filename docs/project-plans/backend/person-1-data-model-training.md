# Backend Person 1 Plan: Data, Features, Labels, Training, Artifacts

> **Implementation note:** Use task-by-task implementation. Dispatch this file as the full context for Backend Person 1 / Team Member 1.

**Goal:** Own the model and data foundation that the backend consumes: parquet split contract, feature/label generation, model artifacts, inference runtime primitives, and smoke tests.

**Architecture:** Person 1 does not implement FastAPI. They produce deterministic Python primitives that can be imported by the API owner: load local data, load the submitted model, align features, score risk probabilities, rank queue items, and report provenance.

**Tech stack:** pandas, numpy, XGBoost, ONNX Runtime, scikit-learn, Optuna, pyarrow, pytest.

**Shared guide:** Read `backend-file-implementation-guide.md` before implementing; it explains how Person 1 outputs are consumed by `src/api.py`, `src/api_schemas.py`, and backend tests.

**Commit rule:** Commit summaries must be in Bahasa Indonesia, for example `feat: rapikan resolver artefak model` or `test: pastikan inferensi held-out tidak retrain`.

---

## Owned files

Create or maintain these files:

```text
src/__init__.py
src/artifacts.py
src/data.py
src/split.py
src/features.py
src/labels.py
src/model.py
src/product_demo.py
scripts/inference_smoke.py
tests/test_artifacts.py
tests/test_product_demo.py
tests/test_inference_readiness_contract.py
requirements.txt
Makefile
```

## Task 1: Lock project constants and artifact paths

**Objective:** Make the runtime resolve only accepted submitted artifacts.

**Files:**

- Create/modify: `src/artifacts.py`
- Test: `tests/test_artifacts.py`

**Steps:**

1. Define `PROJECT_ROOT = Path(__file__).resolve().parents[1]`.
2. Define accepted artifacts:
   - UBJ: `model_risk.ubj`
   - ONNX: `model_risk.onnx`
3. Implement `resolve_model_artifact(kind, explicit_path=None, project_root=None)`.
4. Reject legacy fallback paths such as `models/xgb_model.ubj` and `models/xgb_model.onnx`.
5. Add tests proving both submitted artifacts exist and legacy-only tmp dirs fail.

**Verification:**

```bash
pytest tests/test_artifacts.py -q
```

Expected: artifact resolver returns root `model_risk.*` files and never regenerates them.

## Task 2: Preserve split-data contract

**Objective:** Ensure every team member understands train/test split boundaries.

**Files:**

- Create/modify: `src/split.py`
- Read from: `train_data/`, `test_data/`

**Implementation notes:**

- `train_data/` and `test_data/` each contain `raw.parquet`, `features.parquet`, and `labels.parquet`.
- External split separates held-out proof from training.
- Internal dev splits may exist within train only: `train_fit`, `val_hpo`, `val_calibration`.
- HPO/calibration/threshold tuning must never inspect `test_data`.

**Verification:**

```bash
python - <<'PY'
from pathlib import Path
for split in ['train_data', 'test_data']:
    for name in ['raw.parquet', 'features.parquet', 'labels.parquet']:
        path = Path(split) / name
        assert path.is_file(), path
        print(path, path.stat().st_size)
PY
```

## Task 3: Feature engineering module

**Objective:** Recreate feature generation from flattened procurement data.

**Files:**

- Create/modify: `src/features.py`

**Core functions to implement:**

- `_to_numeric`
- `_safe_log1p`
- `_safe_len`
- `_safe_token_count`
- `_parse_dates`
- `tier1_features`
- `tier2_features`
- `compute_all_features`
- `save_features`

**Feature families:**

- tender value scale and log amount
- price deviation ratios
- tender title/description length and token counts
- procurement method flags
- timing flags and date-derived features
- buyer/supplier repeat interaction features
- recent supplier activity features
- buyer value spike features

**Verification:**

- Generated features must be numeric and stable.
- Feature names used by `model_risk.ubj` must exist in `test_data/features.parquet`.
- Missing model features must raise a clear error at inference time.

## Task 4: Heuristic labels and red flags

**Objective:** Recreate risk labels used for model training and interpretability.

**Files:**

- Create/modify: `src/labels.py`

**Core functions to implement:**

- single-bid flags
- short title/description flags
- Q4 timing flags
- price deviation flags
- high-value flags
- repeat buyer/supplier flags
- recent supplier surge flags
- direct procurement flags
- `compute_red_flags`
- `compute_risk_labels`
- `save_labels`

**Safety language:** Labels are heuristic risk labels, not verified fraud or legal findings.

## Task 5: Model lifecycle utilities

**Objective:** Recreate training/evaluation utilities without mixing them into product runtime.

**Files:**

- Create/modify: `src/model.py`

**Core responsibilities:**

- load train/test artifacts
- train XGBoost classifier
- run Optuna HPO on train/dev only
- compute class/sample weights
- fit calibration temperature
- evaluate macro-F1, accuracy, log loss, confusion matrix
- save/load UBJ model
- export ONNX and check ONNX parity
- save metrics and threshold files

**Rules:**

- Training utilities may call `.fit()`.
- Product runtime files must not call `.fit()`.
- HPO uses only training/dev splits.
- `test_data` is final evaluation only.

## Task 6: Offline prediction backend

**Objective:** Build a runtime-safe model adapter that scores local feature rows.

**Files:**

- Create/modify: `src/product_demo.py`
- Test: `tests/test_product_demo.py`

**Core classes:**

- `DemoDataset`
- `PredictionBackend`
- `InferenceRunMetadata`
- `ArchiveInferenceMetadata`

**Core functions:**

- `load_prediction_backend`
- `load_demo_dataset`
- `load_split_dataset`
- `predict_risk_scores`
- `make_case_id`
- `extract_display_metadata`
- `build_risk_queue`
- `build_inference_run`
- `build_archive_inference_run`

**Critical behavior:**

- `PredictionBackend.align_features()` must require exact model feature names.
- `build_inference_run(max_rows=None, top_n=None)` must score the whole held-out test split.
- `build_risk_queue()` must sort by `risk_priority_score` and probability.
- `build_archive_inference_run()` must combine train/test only for archive browsing and add split labels.

## Task 7: Inference smoke script

**Objective:** Provide one simple command that proves local inference works.

**Files:**

- Create/modify: `scripts/inference_smoke.py`

**Expected behavior:**

- load `model_risk.ubj`
- score all `test_data/features.parquet`
- build Top 50 queue
- print JSON summary
- assert no-cloud/no-scraping/no-retraining metadata flags

**Verification:**

```bash
PYTHONPATH=. python scripts/inference_smoke.py
```

Expected JSON shape:

```json
{"latency_ms": 1234.5, "model": "model_risk.ubj", "rank_1": "...", "rows_displayed": 50, "rows_scored": 93034}
```

## Task 8: Model-only guardrail tests

**Objective:** Prevent regressions in runtime safety.

**Files:**

- Create/modify: `tests/test_no_retraining.py`
- Create/modify: `tests/test_inference_readiness_contract.py`

**Checks:**

- runtime surfaces do not call training/scraping/export APIs
- inference notebook uses submitted artifacts and `test_data`
- backend/frontend implementation files are absent from ML-only repo
- requirements exclude backend/frontend runtime packages

## Final acceptance for Person 1

Run:

```bash
python -m compileall src tests scripts
pytest tests/test_artifacts.py tests/test_product_demo.py tests/test_inference_readiness_contract.py tests/test_no_retraining.py
PYTHONPATH=. python scripts/inference_smoke.py
```

Pass criteria:

- all tests pass
- smoke script scores held-out split
- output uses `model_risk.ubj`
- no backend/frontend code is required for model inference
