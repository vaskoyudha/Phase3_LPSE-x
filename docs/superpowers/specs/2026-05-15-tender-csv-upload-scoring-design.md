# Tender CSV Upload Scoring Design

## Goal

Add a CSV upload flow for new tender packages so operators can score fresh tender rows with the existing LPSE-X risk model.

This feature is for immediate risk scoring only. It must not retrain the model, modify `train_data/`, modify `test_data/`, export model artifacts, scrape live data, or call cloud services.

## Selected Approach

Use a simple LPSE-X CSV template. The backend validates the uploaded file, normalizes it into the existing raw tender schema, generates the existing 34 model features, scores the rows with `model_risk.ubj`, and returns a ranked upload-specific result set.

Uploaded rows are labeled separately from prepared split data:

- `source_split = uploaded_csv`
- `eval_claim_scope = uploaded_scoring_only`
- `is_heldout = false`

The uploaded rows are triase risiko and prioritas review only. They are not evidence for held-out evaluation claims and are not training data.

## Runtime Data Flow

1. Operator uploads a CSV file through the API.
2. Backend parses the CSV with bounded file size and row-count limits.
3. Backend validates required columns and field-level types.
4. Backend normalizes rows into the raw procurement fields expected by `src.features.compute_all_features`.
5. Backend generates features with `compute_all_features()`.
6. Backend loads the existing local prediction backend through product-runtime inference helpers.
7. Backend scores rows and builds a ranked queue.
8. API returns upload metadata, validation warnings, ranked items, model provenance, and LPSE-X guardrail copy.

No upload path writes parquet files, changes model artifacts, or calls `src.model` training functions.

## CSV Template

Required columns:

- `tender_title`
- `tender_description`
- `buyer_name`
- `supplier_name`
- `tender_value_amount`
- `award_value_amount`
- `tender_datePublished`
- `tender_procurementMethod`
- `tender_mainProcurementCategory`

Optional columns:

- `ocid`
- `tender_id`
- `buyer_id`
- `supplier_id`
- `tender_status`
- `award_date`
- `currency`

Missing optional values should be filled with safe defaults that preserve feature generation and display clarity.

## Backend Boundaries

Create a focused module, tentatively `src/uploaded_packages.py`, to own:

- CSV parsing and size limits
- template validation
- row normalization
- feature generation
- prediction/scoring
- upload-specific provenance metadata

Extend `src/api.py` only with upload-facing endpoints:

- `GET /api/uploads/tender-packages/template` returns a sample CSV template.
- `POST /api/uploads/tender-packages` accepts a CSV file and returns scored upload results.

Do not add upload behavior to the existing held-out proof path. `/api/inference-status`, `/api/queue`, and `/api/dataset` remain anchored to `test_data`. Archive browsing remains anchored to prepared local `train_data + test_data`.

## API Response Shape

The upload score response should include:

- `upload_id`
- `rows_received`
- `rows_scored`
- `source_split`
- `eval_claim_scope`
- `model_artifact`
- `model_backend`
- `feature_source = uploaded_csv`
- `raw_source = uploaded_csv`
- `no_cloud_call = true`
- `no_live_scraping = true`
- `no_retraining = true`
- `items`
- `warnings`
- `guardrail`

Each item should reuse the queue-style fields where possible: package title, buyer, supplier, tender value, date, predicted label, probabilities, risk priority score, rank, and review status.

## Validation And Errors

Reject the upload before scoring when:

- required columns are missing
- the file is empty
- row count exceeds the configured limit
- numeric fields cannot be parsed
- date fields cannot be parsed
- CSV parsing fails

Validation errors should be actionable and name the affected columns or row numbers. The API should return a 400-style response for user-fixable CSV problems.

## Testing

Add targeted tests before implementation changes:

- valid template CSV scores rows with the existing model
- missing required columns returns a validation error
- invalid numeric/date fields return row-specific errors
- generated features align with the model feature names
- uploaded rows are labeled `uploaded_csv`, not `train_data` or `test_data`
- upload runtime does not call `.fit()`, `to_parquet()`, `to_csv()`, HPO, model export, scraping, or cloud calls
- existing no-retraining and held-out inference tests still pass

## Non-Goals

- No model retraining from uploaded CSV.
- No mutation of committed split artifacts.
- No persistent review database changes.
- No flexible column-mapping UI in the first version.
- No merging uploaded rows into archive analytics in the first version.

## Implementation Stop Condition

The feature is complete when a valid LPSE-X template CSV can be uploaded, scored locally with the existing model, returned as a ranked queue with upload provenance, and verified by targeted backend tests plus existing no-retraining guardrail tests.
