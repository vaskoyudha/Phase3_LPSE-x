# Backend Rebuild Overview Implementation Plan

> **Implementation note:** Use the `task-by-task implementation` skill to implement this plan task-by-task in a separate full-product repository. This ML-only repo provides the model, data, and inference primitives but intentionally excludes backend source code.

**Goal:** Recreate the LPSE-X backend that serves an offline procurement-risk command center with local XGBoost inference, bounded JSON APIs, selected-case explainability, static casebook export, review workflow, and React static bundle serving.

**Architecture:** The backend is a FastAPI service wrapped around the ML package in this repo. It loads local parquet splits and submitted model artifacts once, caches scored queues server-side, exposes bounded/paginated API responses, and keeps product copy judge-safe.

**Tech stack:** Python 3.11+, FastAPI, Pydantic, pandas, numpy, XGBoost, ONNX Runtime, SQLite, pytest, Vite static output.

**Start here:** After reading this overview, every backend team member must read `backend-file-implementation-guide.md`. That file expands each backend file, endpoint, helper group, test expectation, handoff rule, and the mandatory Bahasa Indonesia commit-message convention.

**Commit rule:** All implementation commits must use Bahasa Indonesia summaries without mentioning the executor, for example `feat: tambah endpoint status inferensi lokal`, `test: pastikan antrean risiko tetap terbatas`, or `docs: perluas panduan backend untuk tim`.

---

## Non-negotiable behavior

The rebuilt backend must preserve these exact product boundaries:

1. **Offline local inference only**: no network calls during runtime scoring.
2. **No retraining**: backend imports runtime inference helpers only; no training/HPO/fit/export calls.
3. **Submitted artifacts only**: accepted artifacts are `model_risk.ubj` and `model_risk.onnx`.
4. **Held-out proof uses test split**: `/api/inference-status`, `/api/queue`, `/api/dataset`, and selected casebook default path are anchored to `test_data/features.parquet` + `test_data/raw.parquet`.
5. **Archive browsing is labeled**: `/api/archive` may score `train_data + test_data`, but every archive row must include `source_split`, `is_heldout`, and `eval_claim_scope`.
6. **Bound frontend payloads**: never send all 93k held-out rows or 465k archive rows to the browser in one response.
7. **Human-review framing**: every response has guardrail copy saying this is *triase risiko*, *prioritas review*, and *bukan tuduhan pelanggaran*.

## Backend layers

### Layer 1: ML runtime adapter

Source primitives from this repo:

- `src.artifacts.resolve_model_artifact`
- `src.product_demo.build_inference_run`
- `src.product_demo.build_archive_inference_run`
- `src.product_demo.build_risk_queue`
- `src.casebook.build_casebook`
- `src.casebook.render_static_casebook_html`

Backend wrapper behavior:

- `@lru_cache(maxsize=1)` around held-out runtime loading.
- Cache full scored held-out queue server-side.
- Build bounded Top-N response slices from cached queue.
- Load archive queue lazily and optionally prewarm analytics.

### Layer 2: API schemas

Create `src/api_schemas.py` with Pydantic models for:

- health/status
- inference metadata
- demo state
- queue rows and queue response
- dataset browser response
- archive response and analytics response
- static casebook status
- review records and review update request

### Layer 3: FastAPI routes

Create `src/api.py` with endpoints:

- `GET /api/health`
- `GET /api/demo-state`
- `GET /api/inference-status`
- `GET /api/queue`
- `GET /api/dataset`
- `GET /api/archive`
- `GET /api/archive/analytics`
- `GET /api/casebook/{case_id}`
- `GET /api/casebook/{case_id}/export.html`
- `GET /api/static-casebook`
- `GET /api/reviews`
- `GET /api/reviews/{case_id}`
- `PUT /api/reviews/{case_id}`
- `GET /assets/{asset_path:path}`
- `GET /` and `GET /{full_path:path}` SPA fallback

### Layer 4: Review workflow

Create `src/reviews.py` with a small SQLite store:

- review statuses
- review upsert by `case_id`
- immutable event/history list
- saved vs draft record distinction
- signed-off timestamps

### Layer 5: Static bundle serving

The backend serves the built frontend from `frontend/dist`:

- mount `/assets` when dist assets exist
- serve `frontend/dist/index.html` for `/` and SPA routes
- return JSON fallback explaining `frontend_dist_missing` when dist is absent

## Team split

### Person 1: Data/model/runtime owner

Responsible for source ML package correctness and inference outputs. See `person-1-data-model-training.md`.

### Person 2: API/runtime service owner

Responsible for FastAPI, caching, filtering, pagination, archive analytics, schemas, and static serving. See `person-2-api-runtime.md`.

### Person 3: explainability/review/quality owner

Responsible for casebook, review workflow, guardrail copy, tests, and final quality gates. See `person-3-explainability-review-quality.md`.

All three people should use `backend-file-implementation-guide.md` as the shared map before writing code, because it explains how `src/api.py`, `src/api_schemas.py`, `src/reviews.py`, and related tests fit together.

## Build milestones

### Milestone A: runtime proof

Commands:

```bash
PYTHONPATH=. python scripts/inference_smoke.py
python -m compileall src tests scripts
pytest tests/test_artifacts.py tests/test_product_demo.py
```

Expected:

- model artifact is `model_risk.ubj`
- held-out row count is 93,034
- Top 50 queue generated locally
- no retraining/cloud/scraping flags are true

### Milestone B: API proof

Commands:

```bash
uvicorn backend.api:app --host 127.0.0.1 --port 8000
curl -fsS http://127.0.0.1:8000/api/demo-state
curl -fsS http://127.0.0.1:8000/api/inference-status
curl -fsS 'http://127.0.0.1:8000/api/queue?demo=1&top_n=50'
```

Expected:

- `ready=true`
- `no_cloud_call=true`
- `no_live_scraping=true`
- `no_retraining=true`
- queue response contains `items`, `summary`, `distribution`, `trend`, and `guardrail`

### Milestone C: archive proof

Commands:

```bash
curl -fsS 'http://127.0.0.1:8000/api/archive?page=1&page_size=20&split=all'
curl -fsS 'http://127.0.0.1:8000/api/archive/analytics?risk=all&split=all'
```

Expected:

- archive response reports train and held-out row counts
- rows include `source_split`, `is_heldout`, `eval_claim_scope`
- response remains bounded and paginated

### Milestone D: casebook/review proof

Commands:

```bash
CASE_ID=$(curl -fsS http://127.0.0.1:8000/api/demo-state | python -c "import sys,json; print(json.load(sys.stdin)['demo_case_id'])")
curl -fsS "http://127.0.0.1:8000/api/casebook/$CASE_ID"
curl -fsS "http://127.0.0.1:8000/api/casebook/$CASE_ID/export.html" > /tmp/casebook.html
curl -fsS "http://127.0.0.1:8000/api/reviews/$CASE_ID"
```

Expected:

- casebook includes model output, factors, narrative, provenance, guardrail, reviewer questions
- export HTML contains selected case disclosure
- draft review is generated even before human save

### Milestone E: full verification

Commands:

```bash
pytest
make inference-smoke
make guardrail-audit
cd frontend && npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all checks pass.
