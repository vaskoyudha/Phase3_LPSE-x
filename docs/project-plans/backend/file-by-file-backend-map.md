# Backend File-by-File Map

For the expanded implementation-level guide, read `backend-file-implementation-guide.md` first. This file remains a compact map; the expanded guide explains exact helper groups, endpoint behavior, test expectations, handoff rules, pitfalls, and Bahasa Indonesia commit-message requirements.

This map describes the backend and ML files from the original working LPSE-X project so project team members can recreate equivalent behavior.

## ML/runtime files included in this repo

### `src/artifacts.py`

Purpose: resolve accepted submitted model artifacts without regeneration.

Key behavior:

- accepts `ubj` and `onnx`
- checks explicit path first, then root submitted artifact
- root artifacts are `model_risk.ubj` and `model_risk.onnx`
- rejects legacy-only `models/xgb_model.*` fallback
- never creates, moves, trains, tunes, or exports models

### `src/product_demo.py`

Purpose: offline runtime adapter for product demo and API.

Key classes:

- `DemoDataset`: aligned feature/raw data and path provenance
- `PredictionBackend`: model artifact, loaded model, feature names, prediction method
- `InferenceRunMetadata`: held-out inference runtime metadata
- `ArchiveInferenceMetadata`: train+test archive browsing metadata

Key functions:

- `load_prediction_backend`: loads XGBoost or ONNX backend
- `load_demo_dataset`: loads `test_data/features.parquet` and `test_data/raw.parquet`
- `load_split_dataset`: loads named split for archive
- `predict_risk_scores`: converts probabilities into risk labels and priority scores
- `extract_display_metadata`: joins raw tender metadata into queue rows
- `build_risk_queue`: ranks rows by priority score/probability
- `build_inference_run`: scores held-out test split
- `build_archive_inference_run`: scores train+test for archive browsing only

### `src/casebook.py`

Purpose: selected-case explainability payload and static HTML report.

Key functions:

- `explain_case`
- `build_casebook`
- `render_static_casebook_html`
- `generate_demo_casebook`

Payload responsibilities:

- package details
- model output and probabilities
- factor list with feature labels and contribution values
- human-readable narrative
- reviewer questions/checklist
- provenance and guardrails

### `src/narrative.py`

Purpose: transform technical features into human-readable, judge-safe Bahasa Indonesia copy.

Key behavior:

- translates feature names into business labels
- phrases outputs as risk triage and review priority
- avoids legal/accusation language
- provides reviewer checks per factor

### `src/explain.py`

Purpose: contribution/SHAP-style explanation support.

Key behavior:

- loads XGBoost model
- computes class contributions
- extracts top factors
- supports summary plots and counterfactual helpers where available

### `src/features.py`

Purpose: feature engineering from flattened procurement data.

Feature families:

- value/log-value
- price deviation
- text length/token signals
- procurement method flags
- temporal signals
- buyer-supplier repeat history
- supplier surge/buyer value spike signals

### `src/labels.py`

Purpose: heuristic risk labels and red-flag construction.

Important rule: labels are heuristic and must not be described as verified corruption/fraud findings.

### `src/model.py`

Purpose: training/evaluation lifecycle.

Contains:

- train/test loaders
- XGBoost training
- Optuna HPO
- calibration
- metrics and plots
- model save/load
- ONNX export/parity
- threshold search

Important split rule: HPO and calibration use train/dev only; test split is final proof.

### `src/data.py`

Purpose: data download/extraction/flattening helpers.

Contains:

- year download helpers
- JSONL flattening
- relational table extraction
- date cleanup
- quality report generation

### `src/split.py`

Purpose: split raw data into external train/test and internal dev partitions.

Contains:

- external raw split
- raw split saving/loading
- internal dev split manifest

### `src/diagnostics.py`

Purpose: model/data diagnostic summaries.

Contains:

- data provenance summaries
- feature health summaries
- proxy feature ablations
- reviewed-label benchmark helpers
- operational review metrics

### `src/evidence.py`, `src/evidence_linking.py`, `src/evidence_sources/`

Purpose: normalize and link external evidence-style records into label-support structures.

Important rule: evidence links support review context; they do not turn model output into a final legal conclusion.

## Backend implementation files to recreate separately

### `src/api_schemas.py`

Purpose: Pydantic schema definitions used by FastAPI and mirrored by frontend TypeScript types.

Recreate models for:

- production build status
- health
- inference status
- demo state
- queue/dataset/archive responses
- archive analytics
- static casebook status
- review update/request/record/list

### `src/api.py`

Purpose: FastAPI application.

Responsibilities:

- app initialization and lifespan prewarm
- cached held-out runtime via `build_inference_run`
- archive runtime via `build_archive_inference_run`
- filtering and pagination helpers
- JSON-safe record conversion
- `/api/*` endpoints
- static frontend serving and SPA fallback
- controlled error handling

Endpoint family:

- health/demo/inference
- queue/dataset/archive/analytics
- casebook/export/static status
- reviews
- assets/root/fallback

### `src/reviews.py`

Purpose: SQLite-backed human review store.

Responsibilities:

- define allowed statuses
- create schema
- get/list/upsert reviews
- append review event history
- preserve model output as snapshot, not mutable source of truth

## Test files to recreate in full product repo

### Model/runtime tests

- `tests/test_artifacts.py`
- `tests/test_product_demo.py`
- `tests/test_no_retraining.py`
- `tests/test_inference_readiness_contract.py`

### Backend API tests

- `tests/test_api.py`
- `tests/test_fastapi_static_bundle.py`
- `tests/test_reviews.py`

### Frontend contract tests

- `tests/test_frontend_contract.py`
- frontend `src/App.test.tsx`

### Guardrail tests

- `tests/test_narrative_guardrails.py`
- `make guardrail-audit`

## Build files

### `requirements.txt`

Full product backend needs ML packages plus:

- `fastapi`
- `uvicorn[standard]`
- `httpx`
- pytest tools

### `Makefile`

Full product targets:

- `install-python`
- `install-frontend`
- `build-frontend`
- `run-api`
- `inference-smoke`
- `verify-python`
- `verify-frontend`
- `guardrail-audit`
- `verify`
