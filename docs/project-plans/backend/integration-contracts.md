# Backend Integration Contracts

This file is the contract between backend team members and frontend team members. If a field changes here, update frontend `types/api.ts`, tests, and plan docs.

All commits that modify backend/frontend contracts must use Bahasa Indonesia summaries, for example `docs: selaraskan kontrak API backend dan frontend`.

## Global response rules

Every public product response should include or be linked to the guardrail:

```text
Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran, bukan putusan akhir, dan wajib ditinjau manusia.
```

Every inference status must preserve:

```json
{
  "inference_mode": "offline_local",
  "no_cloud_call": true,
  "no_live_scraping": true,
  "no_retraining": true
}
```

## `GET /api/health`

Purpose: lightweight backend health.

Response fields:

- `ok`: boolean, defaults true
- `model_artifact`: string or null
- `guardrail`: string

## `GET /api/demo-state`

Purpose: one boot payload for the frontend.

Response fields:

- `ready`: boolean
- `offline_mode`: boolean
- `demo_case_id`: string or null
- `demo_queue_url`: usually `/api/queue?demo=1`
- `casebook_url`: `/api/casebook/{case_id}` or null
- `export_html_url`: `/api/casebook/{case_id}/export.html` or null
- `model_artifact`: `model_risk.ubj` or null
- `feature_source`: `test_data/features.parquet` or null
- `raw_source`: `test_data/raw.parquet` or null
- `inference_status`: InferenceStatus or null
- `guardrail`: string
- `golden_path_steps`: list of presenter steps
- `production_build_status`: object with `dist_present`, `served_by_fastapi`, `index_html`
- `error`: optional string when `ready=false`

Failure mode: return `ready=false` with a short error; do not crash the whole app.

## InferenceStatus shape

Used by `/api/demo-state`, `/api/inference-status`, `/api/queue`, and `/api/dataset`.

Required fields:

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
- `data_load_latency_ms`
- `model_load_latency_ms`
- `prediction_latency_ms`
- `queue_build_latency_ms`
- `total_latency_ms`
- `generated_at`
- `no_cloud_call`
- `no_live_scraping`
- `no_retraining`
- `display_note`
- `guardrail`

## `GET /api/inference-status`

Purpose: prove the held-out runtime path.

Expected values:

- `model_artifact = model_risk.ubj`
- `model_backend = xgboost`
- `feature_source = test_data/features.parquet`
- `raw_source = test_data/raw.parquet`
- `source_split = test_data`
- `rows_scored = 93034`
- `queue_limit = 50`

## Queue item shape

Used by queue, dataset, archive, and selected preview.

Minimum fields:

- `case_id`
- `row_id`
- `ocid`
- `tender_id`
- `risk_rank`
- `package_title`
- `buyer`
- `supplier`
- `tender_value_display`
- `procurement_method`
- `predicted_label`
- `probability`
- `risk_priority_score`
- `probability_low`
- `probability_medium`
- `probability_high`
- `review_status`
- `buyer_region`
- `buyer_region_type`
- `buyer_region_source`
- `buyer_region_note`
- `buyer_region_key`

Archive rows additionally require:

- `archive_id`
- `archive_rank`
- `split_risk_rank`
- `source_split`
- `is_heldout`
- `eval_claim_scope`

## `GET /api/queue`

Purpose: bounded Top-N review queue over held-out inference.

Query params:

- `demo`: boolean
- `top_n`: integer, min 1, max 500, default 50
- `risk`: string, default `all`
- `search`: string
- `buyer`: string
- `supplier`: string

Response fields:

- `summary`: record of KPI counts
- `distribution`: list of `{label, count}`
- `trend`: list of small trend buckets
- `items`: QueueItem[] bounded by `top_n`
- `matched_count`: integer or null
- `inference_status`: InferenceStatus
- `guardrail`: string
- `demo_case_id`: string or null

## `GET /api/dataset`

Purpose: paginated held-out dataset browser.

Query params:

- `page`: integer >= 1
- `page_size`: integer 1..100, default 12
- `risk`, `search`, `buyer`, `supplier`

Response fields:

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

## `GET /api/archive`

Purpose: paginated product archive browsing over train_data + test_data.

Query params:

- `page`: integer >= 1
- `page_size`: integer 1..100, default 100
- `risk`: `all` or a risk label filter
- `split`: `all`, `train_data`, or `test_data`
- `search`
- `buyer`
- `supplier`
- `region_key`
- `sort`: `risk_desc`, `date_desc`, or `value_desc`

Response fields:

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
- `items`: ArchiveRow[]
- `inference_status`: ArchiveInferenceStatus
- `display_note`
- `guardrail`

Safety rule: frontend copy must not present train split rows as evaluation results.

## `GET /api/archive/analytics`

Purpose: bounded aggregate analytics over archive filters.

Response sections:

- `filters`
- `counts`
- `risk_mix`
- `monthly_risk_trend`
- `priority_map`
- `priority_map_meta`
- `concentration`
- `concentration_meta`
- `region_map`
- `region_map_meta`
- `coverage_proof`
- `guardrail`

Bound response sizes so frontend never receives all rows.

## `GET /api/casebook/{case_id}`

Purpose: selected package explanation.

Payload sections:

- `case_id`
- `package`
- `model_output`
- `factors`
- `explanation_brief`
- `narrative`
- `reviewer_questions`
- `provenance`
- `guardrail`
- `guardrail_badges`

## `GET /api/casebook/{case_id}/export.html`

Purpose: selected static report export.

Response: `text/html`.

Must inject a selected-export disclosure with requested case id, exported case id, model artifact, feature source, and raw source.

## Review contracts

### `GET /api/reviews`

Query params:

- `status = all`
- `search = ""`
- `top_n = 50`, max 500

Response:

- `statuses`
- `counts`
- `items`
- `guardrail`

### `GET /api/reviews/{case_id}`

Returns saved record if present; otherwise draft prefilled from casebook.

### `PUT /api/reviews/{case_id}`

Request fields:

- `status`
- `reviewer_name`
- `notes`
- `decision_summary`
- `signed_off`

Unknown `status` returns 422.

## Static serving contracts

- `GET /assets/{asset_path:path}` returns frontend asset or 404.
- `GET /` serves `frontend/dist/index.html` if present.
- `GET /{full_path:path}` serves SPA for non-API routes.
- Missing dist returns JSON with `frontend_dist_missing`, build instruction, and `api_ready` pointer.
