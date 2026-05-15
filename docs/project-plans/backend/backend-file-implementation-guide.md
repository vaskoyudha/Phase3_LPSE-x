# Backend File Implementation Guide untuk Project Contributors

> **Untuk project team member:** Dokumen ini adalah pegangan utama untuk membangun ulang backend LPSE-X dari nol di repo full-product terpisah. Jangan menyalin file backend ke repo ML-only ini. Gunakan dokumen ini untuk memahami fungsi setiap file, urutan implementasi, kontrak antarfile, testing, dan aturan commit.

**Goal:** Membuat project team members memahami keseluruhan backend LPSE-X dengan cepat, termasuk tugas setiap file, alur data dari parquet hingga API, guardrail keamanan klaim, dan checklist implementasi yang bisa dieksekusi bertahap.

**Architecture:** Backend adalah FastAPI service yang membungkus modul ML offline-local. Runtime memuat `model_risk.ubj`, membaca `test_data/` untuk bukti held-out, membaca `train_data + test_data` hanya untuk archive browsing, membuat response JSON yang bounded/paginated, lalu menyajikan React static bundle jika `frontend/dist` tersedia.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, pandas, numpy, XGBoost, ONNX Runtime, SQLite, pytest, FastAPI TestClient.

---

## 0. Aturan kerja wajib untuk semua project team members

### 0.1 Batas repo

Dokumen ini berada di repo ML-only. Saat implementasi backend sebenarnya, buat di repo full-product terpisah.

Di repo ML-only ini, **jangan tambahkan**:

- `src/api.py`
- `src/api_schemas.py`
- `src/reviews.py`
- `frontend/`
- `app.py`
- `package.json`
- `package-lock.json`
- `review_data/`

Backend hanya boleh dijelaskan dalam Markdown plan.

### 0.2 Aturan commit wajib bahasa Indonesia

Semua kontributor wajib membuat commit message dalam Bahasa Indonesia tanpa menyebut pelaksana pekerjaan di ringkasan commit.

Format yang disarankan:

```bash
git commit -m "docs: jelaskan kontrak endpoint arsip backend"
git commit -m "feat: tambah endpoint status inferensi lokal"
git commit -m "test: pastikan antrean risiko tidak mengirim seluruh dataset"
git commit -m "fix: perbaiki validasi status review manusia"
```

Aturan detail:

1. Gunakan prefix teknis singkat bila perlu: `docs:`, `feat:`, `fix:`, `test:`, `chore:`.
2. Setelah prefix, ringkasan harus Bahasa Indonesia.
3. Tulis alasan user-facing, bukan hanya nama file.
4. Hindari ringkasan commit yang menyebut pelaksana kerja, misalnya nama tool otomatis atau pelaksana internal. Tulis seolah perubahan berasal dari tim produk biasa.
5. Hindari commit generic seperti `update`, `changes`, `fix bug`, `wip`.
6. Satu commit harus merepresentasikan satu perubahan yang bisa diverifikasi.
7. Setiap commit harus dilakukan setelah test relevan lolos.

Contoh buruk:

```bash
git commit -m "update files"
git commit -m "add backend stuff"
git commit -m "fix"
```

Contoh baik:

```bash
git commit -m "feat: tambah pagination dataset held-out"
git commit -m "test: validasi archive tetap berlabel train dan test"
git commit -m "docs: perluas panduan implementasi backend untuk tim"
```

### 0.3 Guardrail produk wajib

Semua response user-facing harus menjaga makna:

```text
Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran, bukan putusan akhir, dan wajib ditinjau manusia.
```

Backend tidak boleh:

- scraping live pada runtime demo
- memanggil cloud API saat inference
- retrain model di endpoint API
- menulis ulang `model_risk.ubj` atau `model_risk.onnx`
- mengirim seluruh 93k held-out rows atau 465k archive rows ke browser sekaligus
- menyajikan row `train_data` sebagai bukti evaluasi held-out

---

## 1. Mental model backend LPSE-X

### 1.1 Alur held-out inference

```text
Request frontend
  -> FastAPI /api/demo-state atau /api/queue
  -> _load_runtime() cached sekali
  -> build_inference_run(max_rows=None, top_n=None)
  -> load test_data/features.parquet + test_data/raw.parquet
  -> load model_risk.ubj
  -> align feature names
  -> predict probability low/medium/high
  -> build ranked risk queue
  -> slice/filter/paginate response
  -> JSON bounded ke frontend
```

Makna penting:

- `test_data/` adalah bukti held-out.
- `rows_scored` harus 93.034 untuk inference proof.
- `rows_displayed` berubah sesuai endpoint (`50`, `top_n`, atau `page_size`).
- `generated_at` harus konsisten untuk response yang memakai cache runtime yang sama.

### 1.2 Alur archive browsing

```text
Request /api/archive atau /api/archive/analytics
  -> _load_archive_runtime()
  -> build_archive_inference_run()
  -> score train_data + test_data lokal
  -> add source_split, is_heldout, eval_claim_scope
  -> filter risk/split/search/buyer/supplier/region
  -> paginate atau aggregate bounded
  -> JSON bounded ke frontend
```

Makna penting:

- Archive bukan klaim evaluasi model.
- `train_data` row wajib `eval_claim_scope = archive_browsing_only`.
- `test_data` row wajib `eval_claim_scope = heldout_test_only`.
- Archive response default `page_size = 100`, max `100`.
- Archive analytics point map max `500` points.

### 1.3 Alur casebook dan review

```text
User memilih case_id
  -> /api/casebook/{case_id}
  -> build_casebook(case_id)
  -> factors + narrative + reviewer questions + provenance
  -> /api/reviews/{case_id}
  -> draft review dari casebook jika belum tersimpan
  -> PUT /api/reviews/{case_id}
  -> SQLite ReviewStore menyimpan keputusan manusia
```

Makna penting:

- Model output tidak berubah saat reviewer menyimpan keputusan.
- Review adalah keputusan manusia, bukan perubahan pada model.
- Casebook export HTML harus spesifik untuk selected case.

---

## 2. Struktur backend target yang harus dibangun ulang

```text
product-rebuild/
├── src/
│   ├── api.py                  # FastAPI app, caching, endpoints, filters, static serving
│   ├── api_schemas.py          # Pydantic response/request contracts
│   ├── reviews.py              # SQLite review store
│   ├── artifacts.py            # ML artifact resolver dari repo ML-only
│   ├── product_demo.py         # Offline inference adapter dari repo ML-only
│   ├── casebook.py             # Casebook payload + static HTML renderer
│   ├── narrative.py            # Bahasa Indonesia explanation guardrail
│   ├── explain.py              # SHAP/contribution helpers
│   └── ...                     # modul ML lain yang dibutuhkan
├── scripts/
│   └── inference_smoke.py
├── tests/
│   ├── test_api.py
│   ├── test_fastapi_static_bundle.py
│   ├── test_frontend_contract.py
│   ├── test_reviews.py
│   ├── test_casebook.py
│   ├── test_product_demo.py
│   ├── test_inference_readiness_contract.py
│   ├── test_narrative_guardrails.py
│   └── test_no_retraining.py
├── frontend/dist/              # hasil build React, bukan source saat backend-only task
├── review_data/                # SQLite runtime output, gitignored
├── model_risk.ubj
├── model_risk.onnx
├── train_data/
├── test_data/
├── requirements.txt
└── Makefile
```

---

## 3. File `src/api.py` — pusat orkestrasi FastAPI

### 3.1 Tujuan file

`src/api.py` adalah entrypoint backend product. File ini tidak melatih model; ia hanya:

- membuat `FastAPI` app
- memuat/caching runtime inference
- membangun response API
- melakukan filter, sort, pagination
- membangun archive analytics bounded
- menghubungkan casebook dan review store
- menyajikan `frontend/dist`
- mengubah error runtime menjadi response aman

### 3.2 Dependency yang boleh diimpor

Wajib/normal:

```python
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
```

Local modules:

```python
from backend.api_schemas import ...
from src.casebook import DEFAULT_STATIC_CASEBOOK_PATH, build_casebook, render_static_casebook_html
from src.product_demo import build_inference_run, build_archive_inference_run, SAFE_GUARDRAIL_ID
from backend.reviews import DEFAULT_REVIEW_STATUS, REVIEW_STATUSES, ReviewStore, utc_now_iso
```

Tidak boleh:

- training functions dari `src.model` yang memanggil `.fit()`
- downloader/scraper live untuk endpoint runtime
- writer artifact model

### 3.3 Konstanta wajib

Implementasikan konstanta ini dekat bagian atas file:

```python
PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
ASSETS_DIR = FRONTEND_DIST / "assets"
DEFAULT_QUEUE_TOP_N = 50
MAX_QUEUE_TOP_N = 500
DEFAULT_DATASET_PAGE_SIZE = 12
DEFAULT_ARCHIVE_PAGE_SIZE = 100
MAX_DATASET_PAGE_SIZE = 100
ARCHIVE_ANALYTICS_POINT_LIMIT = 500
ARCHIVE_ANALYTICS_PER_TIER_POINTS = 120
ARCHIVE_ANALYTICS_TOP_VALUE_POINTS = 140
ARCHIVE_CONCENTRATION_LIMIT = 12
REVIEW_DB_PATH = PROJECT_ROOT / "review_data" / "reviews.sqlite3"
```

Catatan:

- `MAX_QUEUE_TOP_N = 500` melindungi browser dari payload terlalu besar.
- `MAX_DATASET_PAGE_SIZE = 100` berlaku untuk dataset dan archive browser.
- `review_data/` harus gitignored.

### 3.4 App initialization dan lifespan

Implementasikan:

- `app = FastAPI(...)`
- lifespan async untuk memulai archive analytics prewarm tanpa blocking boot
- `app.mount('/assets', StaticFiles(...))` hanya jika `frontend/dist/assets` ada

Checklist:

- API tetap bisa jalan walau frontend belum dibuild.
- Missing frontend dist harus return JSON `frontend_dist_missing`, bukan traceback.

### 3.5 Runtime cache functions

#### `_load_runtime()`

Purpose: memuat held-out inference sekali.

Wajib:

```python
@lru_cache(maxsize=1)
def _load_runtime():
    return build_inference_run(max_rows=None, top_n=None)
```

Kontrak:

- source split: `test_data`
- feature source: `test_data/features.parquet`
- raw source: `test_data/raw.parquet`
- model artifact: `model_risk.ubj`
- rows scored: 93.034
- no cloud/scrape/retraining flags true

#### `_load_archive_runtime()`

Purpose: memuat archive `train_data + test_data` untuk browsing dan analytics.

Wajib:

- gunakan lock agar tidak double load saat parallel request
- boleh baca cache disk `runtime_cache/` jika fingerprint valid
- fallback ke `build_archive_inference_run()`
- selalu panggil `_prepare_archive_runtime_queue()` sebelum menyimpan cache memory

Kontrak:

- archive rows: 372.150 train + 93.034 test = 465.184
- setiap row punya `source_split`, `is_heldout`, `eval_claim_scope`
- tidak mengganti held-out inference proof

### 3.6 Helper status builders

#### `_inference_status(metadata, displayed_rows, matched_rows, queue_limit)`

Purpose: ubah `InferenceRunMetadata` menjadi Pydantic `InferenceStatus`.

Wajib isi:

- `model_artifact`
- `model_backend`
- `inference_mode = offline_local`
- `feature_source`
- `raw_source`
- `source_split`
- `rows_scored`
- `rows_ranked`
- `rows_displayed`
- `matched_rows`
- `queue_limit`
- latency fields
- `no_cloud_call = True`
- `no_live_scraping = True`
- `no_retraining = True`
- `guardrail`

#### `_archive_status(metadata, displayed_rows, matched_rows, queue_limit)`

Purpose: ubah `ArchiveInferenceMetadata` menjadi `ArchiveInferenceStatus`.

Tambahan wajib:

- `archive_scope`
- `train_rows`
- `heldout_rows`
- `feature_sources`
- `raw_sources`
- `source_splits`

### 3.7 Helper response data

#### `_records(df)`

Purpose: konversi DataFrame ke list dict JSON-safe.

Wajib:

- ubah `NaN` menjadi `None`
- pastikan numpy scalar aman untuk JSON
- jangan mutate source DataFrame kalau tidak perlu

#### `_summary(queue)`

Purpose: ringkasan KPI untuk dashboard.

Expected keys minimal:

- total
- high/risk tinggi
- medium/risk sedang
- low/risk rendah

#### `_distribution(queue)`

Purpose: list label count untuk chart.

Expected shape:

```json
[{"label": "Risiko Tinggi", "count": 123}]
```

#### `_trend(queue)`

Purpose: trend kecil untuk queue overview, bukan monthly archive trend.

Rules:

- jangan buat fake `Demo-` buckets
- jangan pakai `month/tinggi/sedang/rendah` shape untuk queue overview
- expected keys: `bucket`, `average_priority`, `review_count`

### 3.8 Filtering dan pagination

#### `_filter_ranked_rows(queue, risk, search, buyer, supplier)`

Digunakan oleh dataset browser held-out.

Rules:

- filter risk bila bukan `all`
- search case-insensitive ke case id, title, buyer, supplier, tender id/ocid bila ada
- filter buyer/supplier case-insensitive
- return DataFrame filtered, jangan langsung slice kecuali fungsi caller meminta

#### `_filter_queue(queue, risk, search, buyer, supplier, top_n)`

Digunakan oleh `/api/queue`.

Rules:

- panggil `_filter_ranked_rows`
- hitung `matched_count` sebelum top-N slice
- return `filtered.head(top_n)` dan `matched_count`

#### `_filter_archive_rows(archive_queue, risk, split, search, buyer, supplier, region_key, sort)`

Digunakan oleh archive browser dan analytics.

Rules:

- `split`: `all`, `train_data`, `test_data`
- `risk`: `all` atau exact label
- `region_key`: normalized key
- `sort`: `risk_desc`, `date_desc`, `value_desc`
- kalau filter kosong, tetap return DataFrame dengan schema stabil

#### `_page_rows(df, page, page_size)`

Rules:

- page min 1 di FastAPI Query
- jika page terlalu besar, clamp ke total page terakhir
- return `(page_items, total_pages, effective_page)`
- empty set tetap valid: page 1, total_pages 1 atau 0 sesuai implementasi stabil

### 3.9 Archive analytics helpers

Archive analytics harus bounded dan reproducible.

Implementasikan helper berikut:

- `_archive_dates_utc`
- `_archive_date_range`
- `_monthly_risk_trend`
- `_analytics_risk_color`
- `_analytics_risk_filter_value`
- `_analytics_text`
- `_tender_value_display_for_row`
- `_hydrate_tender_value_display`
- `_analytics_numeric`
- `_archive_with_filtered_rank`
- `_archive_priority_map`
- `_archive_concentration`
- `_archive_region_map`
- `_archive_coverage_proof`
- `_archive_donut`
- `_build_archive_analytics_response`
- `_archive_analytics_response_cached`

Key expectations:

- `priority_map` max 500 points
- sampling strategy: balanced per risk tier + top positive contract value
- concentration max 12 regional and 12 buyer items
- monthly trends pakai data tanggal asli, bukan demo buckets
- empty filter tetap return shape stabil dengan empty arrays dan zero counts
- `coverage_proof` harus menyatakan no cloud/no scrape/no retraining

### 3.10 Casebook helpers di API layer

#### `_casebook_payload(case_id)`

Purpose: wrapper `build_casebook` dengan runtime cached.

Rules:

- cari case berdasarkan `case_id`
- jika tidak ditemukan, return HTTP 404/503 aman
- jangan expose traceback panjang

#### `export_casebook(case_id)`

Endpoint harus:

- build selected payload
- render static HTML ke temporary directory
- inject disclosure:
  - requested case id
  - exported case id
  - model artifact
  - feature source
  - raw source
- return `HTMLResponse`

### 3.11 Review helpers di API layer

#### `_review_store()`

Purpose: cached `ReviewStore(REVIEW_DB_PATH)`.

Rules:

- lru_cache supaya store tidak dibuat ulang tiap request
- test bisa monkeypatch `REVIEW_DB_PATH`, maka cache harus bisa di-clear

#### `_draft_review(case_id)`

Purpose: buat draft review dari casebook jika belum tersimpan.

Wajib berisi:

- `case_id`
- `status = DEFAULT_REVIEW_STATUS`
- empty reviewer fields
- package snapshot
- model snapshot
- prefill checklist/rationale
- `is_saved = False`
- `guardrail`

#### `_review_snapshots(casebook_payload)`

Purpose: ambil snapshot package/model agar review manusia tidak tergantung perubahan model runtime setelah disimpan.

#### `_review_record(payload)`

Purpose: normalize saved/draft review menjadi `ReviewRecord` Pydantic.

#### `_review_counts(items)`

Purpose: count per status untuk review list.

### 3.12 Endpoints di `src/api.py`

#### `GET /api/health`

Purpose: health check ringan.

Expected:

- status 200
- `ok = true`
- `mode = offline_local`
- `model_artifact` jika runtime bisa load
- `guardrail`

Test wajib:

```bash
pytest tests/test_api.py::test_health_returns_offline_guardrail_contract -q
```

#### `GET /api/demo-state`

Purpose: boot payload frontend.

Expected when ready:

- `ready = true`
- `offline_mode = true`
- `demo_queue_url = /api/queue?demo=1`
- `demo_case_id`
- `casebook_url`
- `export_html_url`
- `model_artifact = model_risk.ubj`
- `feature_source = test_data/features.parquet`
- `raw_source = test_data/raw.parquet`
- `inference_status`
- `golden_path_steps`
- `production_build_status`

Failure rule:

- jika runtime gagal, return `ready = false` dan `error`, jangan crash.

#### `GET /api/inference-status`

Purpose: bukti inference held-out.

Expected:

- source split `test_data`
- rows scored 93.034
- queue limit 50
- no archive fields

#### `GET /api/queue`

Query:

- `demo: bool = False`
- `top_n: int = 50`, min 1, max 500
- `risk = all`
- `search = ""`
- `buyer = ""`
- `supplier = ""`

Response:

- `summary`
- `distribution`
- `trend`
- `items`
- `matched_count`
- `inference_status`
- `guardrail`
- `demo_case_id`

Rules:

- never return more than `top_n`
- `top_n=0` and `top_n=501` return 422
- `rows_scored` stays full held-out count
- `rows_displayed` equals number of returned items

#### `GET /api/dataset`

Query:

- `page >= 1`
- `page_size` min 1 max 100 default 12
- `risk`, `search`, `buyer`, `supplier`

Purpose: held-out dataset browser.

Rules:

- only `test_data`
- no archive/train rows
- response paginated
- final page clamps correctly
- `display_note` says browser tidak menerima arsip penuh

#### `GET /api/archive`

Query:

- `page >= 1`
- `page_size` min 1 max 100 default 100
- `risk = all`
- `split = all | train_data | test_data`
- `search`, `buyer`, `supplier`, `region_key`
- `sort = risk_desc | date_desc | value_desc`

Purpose: browse scored local archive.

Rules:

- include train and test counts
- include split distribution
- include monthly risk trend and date range
- each item includes `archive_id`, `archive_rank`, `split_risk_rank`, `source_split`, `is_heldout`, `eval_claim_scope`
- `train_data` rows are archive browsing only

#### `GET /api/archive/analytics`

Purpose: aggregate bounded analytics.

Response sections:

- `filters`
- `counts`
- `priority_map`
- `priority_map_meta`
- `regional_concentration`
- `regional_meta`
- `buyer_concentration`
- `buyer_meta`
- `coverage_proof`
- `monthly_trends`
- `donut`
- `display_note`
- `guardrail`

Rules:

- empty filters return stable empty shape
- no unbounded raw rows
- `priority_map_meta.point_limit = 500`

#### `GET /api/casebook/{case_id}`

Purpose: selected-case explainability payload.

Rules:

- output must match requested selected case
- include model output, factors, narrative, reviewer questions, provenance, guardrail
- not generic static report

#### `GET /api/casebook/{case_id}/export.html`

Purpose: selected static HTML export.

Rules:

- `Content-Type` text/html
- contains selected case id signal
- contains `model_risk.ubj`
- contains Top Risk Factors and Reviewer Checklist sections
- contains guardrail copy

#### `GET /api/static-casebook`

Purpose: report default static `demo_casebook.html` availability.

Rules:

- `primary_export = False`
- primary export route is selected-case export

#### `GET /api/reviews`

Query:

- `status = all`
- `search = ""`
- `top_n = 50`, max 500

Purpose: list saved and/or draft review queue items.

Rules:

- include `statuses`, `counts`, `items`, `guardrail`
- status unknown returns 422

#### `GET /api/reviews/{case_id}`

Purpose: return saved review or draft.

Rules:

- no saved row -> draft from casebook with `is_saved = False`
- saved row -> stored review with history and `is_saved = True`

#### `PUT /api/reviews/{case_id}`

Purpose: save human review.

Request:

```json
{
  "status": "Ditandai Risiko",
  "reviewer_name": "Vasco Yudha",
  "notes": "Perlu eskalasi karena checklist awal perlu dibuktikan.",
  "decision_summary": "Eskalasi untuk verifikasi dokumen pendukung.",
  "signed_off": true
}
```

Rules:

- unknown status returns 422
- appends event history
- sets `signed_off_at` when signed off/completed
- does not mutate model output

#### Static routes

- `GET /assets/{asset_path:path}` returns built asset or 404
- `GET /` returns SPA index if present, otherwise JSON `frontend_dist_missing`
- `GET /{full_path:path}` returns SPA for non-API paths
- `/api/not-a-real-route` must stay JSON 404, not SPA HTML

---

## 4. File `src/api_schemas.py` — kontrak Pydantic

### 4.1 Tujuan file

`src/api_schemas.py` menjadi single source of truth untuk response/request FastAPI dan harus mirrored oleh frontend `src/types/api.ts`.

project team member harus membuat schema eksplisit agar:

- response konsisten
- test frontend/backend contract mudah
- field safety seperti `no_retraining` tidak hilang
- archive split labels tidak hilang

### 4.2 Models wajib dan field penting

#### `ProductionBuildStatus`

Fields:

- `dist_present: bool`
- `served_by_fastapi: bool`
- `index_html: str`

Used by: `/api/demo-state`.

#### `HealthResponse`

Fields:

- `ok: bool = True`
- `mode: str = "offline_local"`
- `model_artifact: str | None`
- `guardrail: str`

Used by: `/api/health`.

#### `InferenceStatus`

Fields wajib:

- `model_artifact`
- `model_backend`
- `inference_mode`
- `feature_source`
- `raw_source`
- `source_split`
- `rows_scored`
- `rows_ranked`
- `rows_displayed`
- `matched_rows`
- `queue_limit`
- `loaded_rows_cap`
- latency fields
- `generated_at`
- `no_cloud_call`
- `no_live_scraping`
- `no_retraining`
- `display_note`
- `guardrail`

Used by: demo state, inference status, queue, dataset.

#### `DemoStateResponse`

Fields wajib:

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
- `error`

#### `QueueResponse`

Fields:

- `summary`
- `distribution`
- `trend`
- `items`
- `matched_count`
- `inference_status`
- `guardrail`
- `demo_case_id`

#### `DatasetBrowserResponse`

Fields:

- `total_rows`
- `matched_count`
- `page`
- `page_size`
- `total_pages`
- `columns`
- `items`
- `inference_status`
- `display_note`
- `guardrail`

#### `ArchiveInferenceStatus`

Fields `InferenceStatus` versi archive plus:

- `archive_scope`
- `train_rows`
- `heldout_rows`
- `feature_sources`
- `raw_sources`
- `source_splits`

#### `MonthlyRiskTrendItem`

Fields:

- `month`
- `tinggi`
- `sedang`
- `rendah`
- `total`
- `average_priority`

#### `ArchiveDateRange`

Fields:

- `start_month`
- `end_month`
- `valid_date_rows`
- `invalid_date_rows`

#### `ArchiveBrowserResponse`

Fields:

- `total_rows`
- `matched_count`
- `page`
- `page_size`
- `total_pages`
- `archive_scope`
- `heldout_rows`
- `train_rows`
- `risk_distribution`
- `split_distribution`
- `monthly_risk_trend`
- `date_range`
- `columns`
- `items`
- `inference_status`
- `display_note`
- `guardrail`

#### Archive analytics models

Wajib buat model untuk:

- `ArchiveAnalyticsFilters`
- `ArchiveAnalyticsCounts`
- `ArchivePriorityPoint`
- `ArchivePriorityMapMeta`
- `ArchiveConcentrationItem`
- `ArchiveRegionMapItem`
- `ArchiveRegionMapMeta`
- `ArchiveConcentrationMeta`
- `ArchiveCoverageProof`
- `ArchiveDonutSegment`
- `ArchiveAnalyticsResponse`

`ArchiveAnalyticsResponse` harus include:

- `filters`
- `counts`
- `priority_map`
- `priority_map_meta`
- `regional_concentration`
- `regional_meta`
- `buyer_concentration`
- `buyer_meta`
- `coverage_proof`
- `monthly_trends`
- `donut`
- `display_note`
- `guardrail`

#### Review models

`ReviewUpdateRequest`:

- `status`
- `reviewer_name`
- `notes`
- `decision_summary`
- `signed_off`

`ReviewRecord`:

- `case_id`
- `status`
- `reviewer_name`
- `notes`
- `decision_summary`
- `package_snapshot`
- `model_snapshot`
- `prefill`
- `created_at`
- `updated_at`
- `signed_off_at`
- `is_saved`
- `event_count`
- `history`
- `guardrail`

`ReviewListResponse`:

- `statuses`
- `counts`
- `items`
- `guardrail`

### 4.3 Schema testing

Minimal commands:

```bash
python -m compileall src/api_schemas.py
pytest tests/test_api.py::test_archive_analytics_endpoint_returns_bounded_judge_safe_contract -q
```

Pitfall:

- Jangan membuat terlalu banyak `dict[str, Any]` untuk bagian yang frontend butuh typed kuat. Untuk row tabel boleh `dict[str, Any]`, tapi analytics lebih baik typed.

---

## 5. File `src/reviews.py` — SQLite human review store

### 5.1 Tujuan file

`src/reviews.py` menyimpan keputusan manusia secara lokal tanpa mengubah model output.

File ini harus kecil dan deterministic:

- tidak import FastAPI
- tidak import pandas
- tidak import model training
- hanya SQLite + JSON serializer

### 5.2 Status wajib

Gunakan status Indonesia:

```python
REVIEW_STATUSES = [
    "Perlu Review",
    "Sedang Direview",
    "Butuh Bukti Tambahan",
    "Ditandai Risiko",
    "Clear / Tidak Prioritas",
    "Selesai",
]
DEFAULT_REVIEW_STATUS = REVIEW_STATUSES[0]
```

### 5.3 Helper wajib

#### `utc_now_iso()`

Return timestamp timezone-aware ISO string.

#### `_json_dump(value)`

Serialize JSON dengan `ensure_ascii=False` dan `sort_keys=True`.

#### `_json_load(value, fallback)`

Deserialize aman; jika value kosong atau invalid, return fallback.

### 5.4 Class `ReviewStore`

#### Constructor

```python
class ReviewStore:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._initialized = False
```

#### `_connect()`

Rules:

- create parent directory
- set `row_factory = sqlite3.Row`
- init schema once

#### `_init_schema(conn)`

Tables:

`reviews`:

- `case_id` primary key
- `status`
- `reviewer_name`
- `notes`
- `decision_summary`
- `package_snapshot`
- `model_snapshot`
- `prefill`
- `created_at`
- `updated_at`
- `signed_off_at`

`review_events`:

- autoincrement id
- `case_id`
- `status`
- `reviewer_name`
- `notes`
- `decision_summary`
- `created_at`

#### `get_review(case_id)`

Return full saved record with history, or `None`.

#### `list_reviews()`

Return saved reviews ordered by latest update. For list view, history boleh omitted for performance.

#### `upsert_review(...)`

Rules:

- insert or update `reviews`
- append to `review_events` every save
- preserve original `created_at`
- update `updated_at`
- set `signed_off_at` when `signed_off=True`
- return fresh saved record

### 5.5 Tests wajib

```bash
pytest tests/test_reviews.py -q
```

Test cases:

- unsaved case returns draft from API layer
- upsert saves signoff and event history
- unknown status rejected by API layer

---

## 6. Test files backend yang harus dibuat

### 6.1 `tests/test_api.py`

Purpose: contract utama backend.

Harus cover:

- health guardrail
- demo state readiness
- inference status held-out
- queue top_n min/max validation
- dataset pagination
- archive pagination + split labels
- archive monthly trend/date range
- archive analytics bounded response
- cached inference metadata shared
- selected casebook and selected export HTML
- static casebook status
- model artifacts not mutated

Expected constants:

```python
EXPECTED_HELD_OUT_ROWS = 93034
EXPECTED_TRAIN_ROWS = 372150
EXPECTED_ARCHIVE_ROWS = EXPECTED_HELD_OUT_ROWS + EXPECTED_TRAIN_ROWS
```

### 6.2 `tests/test_fastapi_static_bundle.py`

Purpose: FastAPI + SPA serving contract.

Harus cover:

- `/` returns HTML if dist exists
- if dist missing, returns JSON `frontend_dist_missing`
- known SPA routes return HTML when built
- `/api/*` routes not swallowed by SPA fallback
- unknown API route returns JSON 404

### 6.3 `tests/test_reviews.py`

Purpose: review workflow.

Harus cover:

- draft review without saved record
- PUT saves human signoff
- history appended
- list reviews by status
- unknown status returns 422

### 6.4 `tests/test_frontend_contract.py`

Purpose: make sure frontend source consumes backend contract correctly.

In backend-only rebuild, test ini boleh ditunda sampai frontend source ada, tapi contract-nya harus sudah disiapkan:

- client uses `/api/demo-state`, `/api/queue`, `/api/casebook/`, `/api/archive`, `/api/reviews`
- frontend copy contains guardrail
- Vite dev proxy points ke backend target yang benar
- command center uses archive monthly trend from API, not fake client demo trend

### 6.5 Existing ML tests yang tetap wajib jalan

- `tests/test_artifacts.py`
- `tests/test_product_demo.py`
- `tests/test_casebook.py`
- `tests/test_narrative_guardrails.py`
- `tests/test_no_retraining.py`
- `tests/test_inference_readiness_contract.py`

---

## 7. Makefile target full-product backend

Full-product repo perlu target:

```makefile
.PHONY: install-python install-frontend build-frontend run-api inference-smoke verify-python verify-frontend guardrail-audit verify

install-python:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt

run-api:
	PYTHONPATH=. .venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 8888

inference-smoke:
	PYTHONPATH=. .venv/bin/python scripts/inference_smoke.py

verify-python:
	.venv/bin/python -m compileall src tests scripts
	PYTHONPATH=. .venv/bin/python -m pytest tests

build-frontend:
	cd frontend && npm ci && npm run typecheck && npm run lint && npm run test && npm run build

guardrail-audit:
	# scan source/docs for unsafe final-claim copy

verify: verify-python inference-smoke guardrail-audit
```

Catatan port:

- Jika gateway lain memakai port 8000, pakai `8888` untuk backend dev.
- Frontend Vite proxy harus diarahkan ke backend dev target.

---

## 8. Urutan implementasi yang disarankan untuk project team members

### Phase 1 — Contract skeleton

Owner: Person 2.

1. Buat `src/api_schemas.py` dengan semua Pydantic models.
2. Buat skeleton `src/api.py` dengan app, constants, health route.
3. Buat tests health dan compile.
4. Commit Bahasa Indonesia:

```bash
git add src/api.py src/api_schemas.py tests/test_api.py
git commit -m "feat: tambah kerangka kontrak API backend"
```

### Phase 2 — Held-out runtime endpoints

Owner: Person 1 + Person 2.

1. Pastikan `src.product_demo.build_inference_run()` berjalan.
2. Implement `_load_runtime()` cache.
3. Implement `_inference_status()`.
4. Implement `/api/demo-state`, `/api/inference-status`, `/api/queue`, `/api/dataset`.
5. Test rows scored, queue limits, page size validation.
6. Commit:

```bash
git commit -m "feat: tambah endpoint inferensi held-out lokal"
```

### Phase 3 — Archive browser

Owner: Person 2.

1. Implement `_load_archive_runtime()`.
2. Implement archive filtering/sorting/pagination.
3. Implement `/api/archive`.
4. Pastikan split labels ada.
5. Commit:

```bash
git commit -m "feat: tambah browser arsip lokal berlabel split"
```

### Phase 4 — Archive analytics

Owner: Person 2.

1. Implement monthly trend/date range.
2. Implement priority map bounded.
3. Implement concentration by region and buyer.
4. Implement coverage proof and donut.
5. Implement response cache.
6. Commit:

```bash
git commit -m "feat: tambah analytics arsip dengan payload terbatas"
```

### Phase 5 — Casebook selected case

Owner: Person 3 + Person 2.

1. Implement `_casebook_payload()`.
2. Implement `/api/casebook/{case_id}`.
3. Implement `/api/casebook/{case_id}/export.html`.
4. Test selected export contract.
5. Commit:

```bash
git commit -m "feat: tambah casebook terpilih dan ekspor HTML"
```

### Phase 6 — Review workflow

Owner: Person 3 + Person 2.

1. Implement `src/reviews.py`.
2. Implement review helpers in API.
3. Implement review endpoints.
4. Test draft, save, history, invalid status.
5. Commit:

```bash
git commit -m "feat: tambah workflow review manusia berbasis SQLite"
```

### Phase 7 — Static frontend serving

Owner: Person 2.

1. Implement `/assets/{asset_path:path}`.
2. Implement `/` and SPA fallback.
3. Ensure `/api/*` not swallowed.
4. Test built/missing dist behavior.
5. Commit:

```bash
git commit -m "feat: sajikan build frontend melalui FastAPI"
```

### Phase 8 — Full verification

Owner: all persons.

Run:

```bash
python -m compileall src tests scripts
PYTHONPATH=. pytest tests
PYTHONPATH=. python scripts/inference_smoke.py
make guardrail-audit
```

If frontend exists:

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Final commit if needed:

```bash
git commit -m "test: verifikasi integrasi backend LPSE-X"
```

---

## 9. Handoff antar 3 backend team members

### Person 1 -> Person 2 handoff

Person 1 harus memberi:

- artifact resolver ready
- `build_inference_run()` works
- `build_archive_inference_run()` works
- metadata fields documented
- smoke output rows scored 93.034
- no retraining/no scraping tests pass

Person 2 tidak boleh mulai API runtime jika `scripts/inference_smoke.py` gagal.

### Person 2 -> Person 3 handoff

Person 2 harus memberi:

- `/api/demo-state` returns `demo_case_id`
- `/api/queue?demo=1` returns rank #1 selected item
- `_casebook_payload(case_id)` has runtime access
- review endpoint skeleton available

Person 3 tidak boleh menganggap selected case static; harus pakai `case_id` dari runtime.

### Person 3 -> Person 2 handoff

Person 3 harus memberi:

- `build_casebook(case_id)` stable
- `render_static_casebook_html(payload, output)` stable
- `ReviewStore` stable
- guardrail tests pass

Person 2 lalu menghubungkan ke HTTP endpoints.

---

## 10. Common pitfalls untuk project team members

1. **Menjalankan training dari API**
   - Salah: endpoint import training/HPO dari `src.model`.
   - Benar: endpoint hanya pakai `build_inference_run` dan `build_archive_inference_run`.

2. **Mengirim full dataset ke frontend**
   - Salah: `items = _records(queue)` untuk 93k/465k rows.
   - Benar: filter + page/top-N dulu.

3. **Mencampur train dan test untuk klaim evaluasi**
   - Salah: archive all disebut held-out proof.
   - Benar: archive browsing diberi split labels dan scope.

4. **SPA fallback menelan API 404**
   - Salah: `/api/not-real` return `index.html`.
   - Benar: API unknown return JSON 404.

5. **Review manusia mengubah model output**
   - Salah: save review menulis model/data artifacts.
   - Benar: save review hanya SQLite snapshots + history.

6. **Commit message bahasa Inggris/generic**
   - Salah: `fix backend`.
   - Benar: `fix: perbaiki validasi status review`.

7. **Guardrail copy hilang di salah satu response**
   - Semua user-facing response harus membawa guardrail atau safety note.

8. **Casebook export generic**
   - Export harus selected-case-specific dan menyebut requested/exported case id.

9. **Archive analytics tidak bounded**
   - Jangan return semua points. Gunakan limit, sampling, dan metadata `is_capped`.

10. **Cache runtime tidak konsisten**
    - `generated_at` pada demo/status/queue/dataset harus konsisten selama cache sama.

---

## 11. Acceptance checklist final backend

Backend dianggap siap jika semua ini terpenuhi:

- `GET /api/health` returns offline guardrail.
- `GET /api/demo-state` ready dengan `model_risk.ubj`.
- `GET /api/inference-status` rows scored 93.034 dari `test_data`.
- `GET /api/queue?top_n=1` returns 1 row.
- `GET /api/queue?top_n=501` returns 422.
- `GET /api/dataset?page=1&page_size=12` returns 12 held-out rows.
- `GET /api/archive?page=1&page_size=100` returns 100 archive rows with split labels.
- `GET /api/archive?split=train_data&page_size=1` returns `eval_claim_scope = archive_browsing_only`.
- `GET /api/archive?split=test_data&page_size=1` returns `eval_claim_scope = heldout_test_only`.
- `GET /api/archive/analytics` returns max 500 priority map points.
- `GET /api/casebook/{case_id}` returns selected case payload.
- `GET /api/casebook/{case_id}/export.html` returns selected HTML export.
- `GET /api/reviews/{case_id}` returns draft if unsaved.
- `PUT /api/reviews/{case_id}` saves human review to SQLite and appends history.
- `/api/not-a-real-route` returns JSON 404.
- `/` serves frontend dist or safe `frontend_dist_missing` JSON.
- Model artifact mtimes unchanged after API calls.
- All relevant commits use Bahasa Indonesia summaries.

---

## 12. Commands final untuk team member executor

```bash
python -m compileall src tests scripts
PYTHONPATH=. pytest tests/test_artifacts.py tests/test_product_demo.py tests/test_api.py tests/test_reviews.py tests/test_fastapi_static_bundle.py tests/test_casebook.py tests/test_narrative_guardrails.py tests/test_no_retraining.py tests/test_inference_readiness_contract.py
PYTHONPATH=. python scripts/inference_smoke.py
make guardrail-audit
git status --short
git log --oneline -5
```

Jika frontend sudah ada:

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Final push:

```bash
git add -A
git commit -m "docs: perluas panduan implementasi backend untuk tim"
git push origin main
```

Commit final di atas hanya contoh. Sesuaikan isi commit dengan perubahan nyata, tetap dalam Bahasa Indonesia.
