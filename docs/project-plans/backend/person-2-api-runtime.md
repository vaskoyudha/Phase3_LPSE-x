# Backend Person 2 Plan: FastAPI Runtime, Caching, Queue, Archive, Static Serving

> **Implementation note:** Use task-by-task implementation. Dispatch this file as the full context for Backend Person 2 / Team Member 2.

**Goal:** Recreate the FastAPI backend service around the ML runtime primitives. The service must expose bounded, judge-safe APIs for demo state, inference status, risk queue, dataset browsing, archive browsing, archive analytics, casebook export, reviews, and static React serving.

**Architecture:** Person 2 imports Person 1 primitives from `src.product_demo` and Person 3 primitives from `src.casebook` / `src.reviews`. Their job is API orchestration, response shaping, caching, pagination, filters, HTTP error handling, and SPA serving.

**Tech stack:** FastAPI, Pydantic, pandas, numpy, functools `lru_cache`, threading for optional prewarm, pytest + FastAPI TestClient.

**Shared guide:** Read `backend-file-implementation-guide.md` before implementing; it expands every `src/api.py` helper, endpoint, schema field, cache behavior, and backend test expectation.

**Commit rule:** Commit summaries must be in Bahasa Indonesia, for example `feat: tambah endpoint status inferensi lokal` or `fix: batasi ukuran payload arsip`.

---

## Owned files

```text
src/api.py
src/api_schemas.py
tests/test_api.py
tests/test_fastapi_static_bundle.py
tests/test_frontend_contract.py
Makefile
```

## Task 1: Define Pydantic API schemas

**Objective:** Create stable frontend/backend JSON contracts.

**File:** `src/api_schemas.py`

**Required models:**

- `ProductionBuildStatus`
- `HealthResponse`
- `InferenceStatus`
- `DemoStateResponse`
- `QueueResponse`
- `DatasetBrowserResponse`
- `ArchiveInferenceStatus`
- `ArchiveBrowserResponse`
- `ArchiveAnalyticsResponse`
- `StaticCasebookResponse`
- `ReviewUpdateRequest`
- `ReviewRecord`
- `ReviewListResponse`

**Fields to preserve:**

- inference flags: `no_cloud_call`, `no_live_scraping`, `no_retraining`
- provenance: model artifact/backend, feature/raw source, source split
- row counts: scored, ranked, displayed, matched
- guardrail string on all user-facing responses
- archive split info: train rows, held-out rows, source splits, eval scope

**Verification:**

```bash
python -m compileall src/api_schemas.py
```

## Task 2: Create FastAPI app skeleton

**File:** `src/api.py`

**Core constants:**

```python
PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
ASSETS_DIR = FRONTEND_DIST / "assets"
DEFAULT_QUEUE_TOP_N = 50
MAX_QUEUE_TOP_N = 500
DEFAULT_DATASET_PAGE_SIZE = 12
DEFAULT_ARCHIVE_PAGE_SIZE = 100
MAX_DATASET_PAGE_SIZE = 100
```

**Create:**

- `app = FastAPI(title="LPSE-X Modern Web Command Center", version="1.0.0", ...)`
- controlled exception `DemoRuntimeError`
- `_safe_error(exc)` for short API-safe messages
- `_build_status()` for frontend dist presence

## Task 3: Cached held-out runtime

**Objective:** Score the held-out split once and reuse it.

**Implement:**

```python
@lru_cache(maxsize=1)
def _load_runtime():
    return build_inference_run(max_rows=None, top_n=None)
```

**Rules:**

- Full held-out split is cached server-side.
- Queue endpoint filters/slices cached rows; it does not rescore per request.
- Errors become `DemoRuntimeError`, then HTTP 503 or `ready=false` demo state.

## Task 4: Archive runtime and analytics cache

**Objective:** Provide product-scale archive browsing without weakening held-out claims.

**Implement:**

- `_load_archive_runtime()` using `build_archive_inference_run()`
- optional disk cache under ignored `runtime_cache/`
- fingerprint checks over `model_risk.ubj`, train/test features, train/test raw
- archive queue preparation columns for numeric risk score, contract value, dates, high-risk flag
- small response cache for archive analytics query combinations
- background prewarm from FastAPI lifespan

**Rules:**

- Archive includes train/test only as browsing surface.
- Every row includes split/source labels.
- Analytics responses are bounded: point limits, concentration limits, monthly trend arrays.

## Task 5: Filtering and pagination helpers

**Objective:** Keep API responses small and deterministic.

**Functions to implement:**

- `_records(df)` converts `NaN`/numpy values into JSON-safe values.
- `_summary(queue)` returns total/high/medium/low or equivalent counts.
- `_distribution(queue)` returns label counts.
- `_trend(queue)` returns small trend buckets.
- `_filter_queue(queue, risk, search, buyer, supplier, top_n)`.
- `_filter_ranked_rows(queue, ...)` for held-out dataset browser.
- `_filter_archive_rows(archive_queue, risk, split, search, buyer, supplier, region_key, sort)`.
- `_page_rows(df, page, page_size)`.
- `_dataset_columns(df)` and `_archive_columns(df)` keep response column order stable.

**Verification:**

- Requests with `top_n > 500` return FastAPI validation error.
- Dataset `page_size > 100` returns validation error.
- Empty filtered results return valid JSON with empty `items`.

## Task 6: Core endpoints

Implement these endpoints exactly:

### `GET /api/health`

Returns app health, model artifact if loadable, and guardrail.

### `GET /api/demo-state`

Returns readiness and golden-path URLs:

- `ready`
- `offline_mode`
- `demo_case_id`
- `demo_queue_url`
- `casebook_url`
- `export_html_url`
- `model_artifact`
- `feature_source`
- `raw_source`
- `inference_status`
- `guardrail`
- `golden_path_steps`
- `production_build_status`

If runtime load fails, return `ready=false` with safe error instead of crashing.

### `GET /api/inference-status`

Returns cached held-out runtime metadata. Expected feature source: `test_data/features.parquet`.

### `GET /api/queue`

Query params:

- `demo: bool = false`
- `top_n: 1..500 = 50`
- `risk = all`
- `search = ""`
- `buyer = ""`
- `supplier = ""`

Returns bounded queue response with summary/distribution/trend/items and inference status.

### `GET /api/dataset`

Query params:

- `page >= 1`
- `page_size 1..100`
- risk/search/buyer/supplier filters

Returns paginated held-out scored dataset.

## Task 7: Archive endpoints

### `GET /api/archive`

Query params:

- `page >= 1`
- `page_size 1..100`
- `risk = all`
- `split = all | train_data | test_data`
- `search`, `buyer`, `supplier`, `region_key`
- `sort = risk_desc | date_desc | value_desc`

Returns paginated archive rows with train/test split labels.

### `GET /api/archive/analytics`

Returns bounded aggregate payload for charts/maps:

- counts
- risk mix
- monthly trend
- concentration by buyer/region
- priority map sampled points
- region map coverage proof

## Task 8: Casebook endpoints

Person 2 wires Person 3 casebook logic into HTTP:

- `GET /api/casebook/{case_id}` returns selected casebook payload.
- `GET /api/casebook/{case_id}/export.html` renders static HTML and injects selected export disclosure.
- `GET /api/static-casebook` reports whether default static HTML exists.

## Task 9: Review endpoints

Person 2 wires Person 3 review store into HTTP:

- `GET /api/reviews`
- `GET /api/reviews/{case_id}`
- `PUT /api/reviews/{case_id}`

Rules:

- unknown review status returns 422
- unsaved case returns prefilled draft from casebook
- saved case returns stored data and history
- all responses include guardrail

## Task 10: Static frontend serving

**Objective:** Serve React/Vite build from FastAPI.

Implement:

- Mount `/assets` if `frontend/dist/assets` exists.
- `GET /assets/{asset_path:path}` returns asset or 404.
- `GET /` returns `frontend/dist/index.html` when present.
- SPA fallback returns index for non-API paths.
- Missing dist returns JSON with `frontend_dist_missing` and build instruction.

## Final acceptance for Person 2

Run:

```bash
python -m compileall src/api.py src/api_schemas.py
pytest tests/test_api.py tests/test_fastapi_static_bundle.py tests/test_frontend_contract.py
uvicorn src.api:app --host 127.0.0.1 --port 8000
```

Manual smoke:

```bash
curl -fsS http://127.0.0.1:8000/api/demo-state
curl -fsS http://127.0.0.1:8000/api/inference-status
curl -fsS 'http://127.0.0.1:8000/api/queue?demo=1&top_n=50'
curl -fsS 'http://127.0.0.1:8000/api/archive?page=1&page_size=12'
```

Pass criteria:

- no endpoint returns full unbounded dataset
- no endpoint retrains, scrapes, or mutates artifacts
- all API response fields match frontend types
- missing frontend dist degrades gracefully
