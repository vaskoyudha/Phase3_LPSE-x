# Tender CSV Upload Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local CSV upload scoring flow that validates tender package CSV rows, scores them with the existing LPSE-X model, and returns upload-specific ranked risk results without retraining or mutating split artifacts.

**Architecture:** Add one focused runtime module, `src/uploaded_packages.py`, for CSV parsing, template validation, normalization, feature generation, and scoring. Add Pydantic response contracts in `src/api_schemas.py`, then expose `GET /api/uploads/tender-packages/template` and `POST /api/uploads/tender-packages` from `src/api.py`. Keep uploaded rows separate from `train_data` and `test_data` with `source_split = uploaded_csv` and `eval_claim_scope = uploaded_scoring_only`.

**Tech Stack:** Python 3, FastAPI, Pydantic, pandas, existing XGBoost/ONNX inference helpers, pytest, FastAPI TestClient.

---

## File Structure

- Create `src/uploaded_packages.py`: upload-specific parsing, validation, normalization, scoring, metadata, and template CSV generation.
- Modify `src/api_schemas.py`: add Pydantic models for upload score metadata and response payloads.
- Modify `src/api.py`: import upload helpers and add two upload endpoints.
- Create `tests/test_uploaded_packages.py`: unit tests for template validation, normalization, scoring labels, and model-feature alignment.
- Modify `tests/test_api.py`: API tests for template endpoint, valid CSV upload, and invalid CSV upload.
- Modify `tests/test_no_retraining.py`: include `src/uploaded_packages.py` in runtime guardrail scanning.

Do not edit `train_data/`, `test_data/`, model artifacts, frontend files, or review database files for this first version.

## Shared Constants And Template

Use this CSV header order everywhere:

```python
REQUIRED_COLUMNS = [
    "tender_title",
    "tender_description",
    "buyer_name",
    "supplier_name",
    "tender_value_amount",
    "award_value_amount",
    "tender_datePublished",
    "tender_procurementMethod",
    "tender_mainProcurementCategory",
]

OPTIONAL_COLUMNS = [
    "ocid",
    "tender_id",
    "buyer_id",
    "supplier_id",
    "tender_status",
    "award_date",
    "currency",
]
```

Default limits:

```python
MAX_UPLOAD_BYTES = 1_000_000
MAX_UPLOAD_ROWS = 1_000
SOURCE_SPLIT = "uploaded_csv"
EVAL_CLAIM_SCOPE = "uploaded_scoring_only"
```

## Task 1: Unit Tests For Upload Validation

**Files:**
- Create: `tests/test_uploaded_packages.py`
- Create later: `src/uploaded_packages.py`

- [ ] **Step 1: Write failing validation tests**

Create `tests/test_uploaded_packages.py` with these initial tests:

```python
import pandas as pd
import pytest

from src.uploaded_packages import (
    EVAL_CLAIM_SCOPE,
    SOURCE_SPLIT,
    UploadedPackageValidationError,
    generate_template_csv,
    normalize_uploaded_rows,
    parse_uploaded_csv,
    validate_uploaded_frame,
)


VALID_CSV = """tender_title,tender_description,buyer_name,supplier_name,tender_value_amount,award_value_amount,tender_datePublished,tender_procurementMethod,tender_mainProcurementCategory,ocid,tender_id,buyer_id,supplier_id,tender_status,award_date,currency
Pembangunan jalan desa,Paket pekerjaan konstruksi jalan desa,Dinas PUPR Kabupaten Sleman,PT Maju Jaya,1500000000,1480000000,2025-01-15,open,works,ocds-upload-1,TDR-1,BYR-1,SUP-1,complete,2025-02-20,IDR
Pengadaan laptop sekolah,Pengadaan perangkat laptop untuk sekolah,Dinas Pendidikan Kota Bandung,CV Teknologi Nusantara,750000000,760000000,2025-02-11,open,goods,ocds-upload-2,TDR-2,BYR-2,SUP-2,complete,2025-03-10,IDR
"""


def test_template_csv_contains_required_and_optional_columns():
    template = generate_template_csv()
    header = template.splitlines()[0].split(",")

    assert "tender_title" in header
    assert "tender_value_amount" in header
    assert "currency" in header
    assert template.endswith("\n")


def test_parse_and_validate_valid_csv():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))

    assert len(frame) == 2
    validate_uploaded_frame(frame)
    assert list(frame["tender_title"]) == ["Pembangunan jalan desa", "Pengadaan laptop sekolah"]


def test_missing_required_column_returns_actionable_error():
    csv_text = VALID_CSV.replace("supplier_name,", "")

    with pytest.raises(UploadedPackageValidationError) as excinfo:
        frame = parse_uploaded_csv(csv_text.encode("utf-8"))
        validate_uploaded_frame(frame)

    detail = excinfo.value.detail
    assert detail["error"] == "missing_required_columns"
    assert detail["missing_columns"] == ["supplier_name"]


def test_invalid_numeric_field_returns_row_specific_error():
    csv_text = VALID_CSV.replace("1500000000", "not-a-number")
    frame = parse_uploaded_csv(csv_text.encode("utf-8"))

    with pytest.raises(UploadedPackageValidationError) as excinfo:
        validate_uploaded_frame(frame)

    detail = excinfo.value.detail
    assert detail["error"] == "invalid_numeric_fields"
    assert detail["fields"][0]["column"] == "tender_value_amount"
    assert detail["fields"][0]["rows"] == [2]


def test_invalid_date_field_returns_row_specific_error():
    csv_text = VALID_CSV.replace("2025-01-15", "not-a-date")
    frame = parse_uploaded_csv(csv_text.encode("utf-8"))

    with pytest.raises(UploadedPackageValidationError) as excinfo:
        validate_uploaded_frame(frame)

    detail = excinfo.value.detail
    assert detail["error"] == "invalid_date_fields"
    assert detail["fields"][0]["column"] == "tender_datePublished"
    assert detail["fields"][0]["rows"] == [2]


def test_normalize_uploaded_rows_adds_upload_provenance_and_raw_defaults():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))
    validate_uploaded_frame(frame)
    raw = normalize_uploaded_rows(frame)

    assert raw["source_split"].tolist() == [SOURCE_SPLIT, SOURCE_SPLIT]
    assert raw["eval_claim_scope"].tolist() == [EVAL_CLAIM_SCOPE, EVAL_CLAIM_SCOPE]
    assert raw["is_heldout"].tolist() == [False, False]
    assert raw["tender_value_currency"].tolist() == ["IDR", "IDR"]
    assert raw["award_value_currency"].tolist() == ["IDR", "IDR"]
    assert raw["tender_items_count"].tolist() == [1, 1]
    assert raw["award_items_count"].tolist() == [1, 1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest tests/test_uploaded_packages.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'src.uploaded_packages'`.

- [ ] **Step 3: Implement validation module skeleton**

Create `src/uploaded_packages.py` with:

```python
"""CSV upload scoring helpers for new tender packages.

This module performs local inference only. It never retrains, exports model
artifacts, writes parquet files, scrapes live data, or calls cloud services.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import uuid4

import pandas as pd

from src.features import compute_all_features
from src.product_demo import (
    DemoDataset,
    SAFE_GUARDRAIL_ID,
    build_risk_queue,
    load_prediction_backend,
    predict_risk_scores,
)

REQUIRED_COLUMNS = [
    "tender_title",
    "tender_description",
    "buyer_name",
    "supplier_name",
    "tender_value_amount",
    "award_value_amount",
    "tender_datePublished",
    "tender_procurementMethod",
    "tender_mainProcurementCategory",
]
OPTIONAL_COLUMNS = [
    "ocid",
    "tender_id",
    "buyer_id",
    "supplier_id",
    "tender_status",
    "award_date",
    "currency",
]
TEMPLATE_COLUMNS = REQUIRED_COLUMNS + OPTIONAL_COLUMNS
NUMERIC_COLUMNS = ["tender_value_amount", "award_value_amount"]
DATE_COLUMNS = ["tender_datePublished", "award_date"]
MAX_UPLOAD_BYTES = 1_000_000
MAX_UPLOAD_ROWS = 1_000
SOURCE_SPLIT = "uploaded_csv"
EVAL_CLAIM_SCOPE = "uploaded_scoring_only"
UPLOAD_FEATURE_SOURCE = "uploaded_csv"
UPLOAD_RAW_SOURCE = "uploaded_csv"


class UploadedPackageValidationError(ValueError):
    """User-fixable CSV validation failure."""

    def __init__(self, detail: dict[str, Any]):
        super().__init__(str(detail))
        self.detail = detail


@dataclass(frozen=True)
class UploadedPackageMetadata:
    upload_id: str
    model_artifact: str
    model_backend: str
    feature_source: str
    raw_source: str
    source_split: str
    eval_claim_scope: str
    rows_received: int
    rows_scored: int
    rows_ranked: int
    data_load_latency_ms: float
    feature_latency_ms: float
    model_load_latency_ms: float
    prediction_latency_ms: float
    queue_build_latency_ms: float
    total_latency_ms: float
    inference_mode: str = "offline_local"
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    guardrail: str = SAFE_GUARDRAIL_ID


def generate_template_csv() -> str:
    sample = {
        "tender_title": "Pembangunan jalan desa",
        "tender_description": "Paket pekerjaan konstruksi jalan desa",
        "buyer_name": "Dinas PUPR Kabupaten Sleman",
        "supplier_name": "PT Maju Jaya",
        "tender_value_amount": "1500000000",
        "award_value_amount": "1480000000",
        "tender_datePublished": "2025-01-15",
        "tender_procurementMethod": "open",
        "tender_mainProcurementCategory": "works",
        "ocid": "ocds-upload-sample-1",
        "tender_id": "TDR-SAMPLE-1",
        "buyer_id": "BUYER-SAMPLE-1",
        "supplier_id": "SUPPLIER-SAMPLE-1",
        "tender_status": "complete",
        "award_date": "2025-02-20",
        "currency": "IDR",
    }
    return pd.DataFrame([sample], columns=TEMPLATE_COLUMNS).to_csv(index=False, lineterminator="\n")


def parse_uploaded_csv(payload: bytes, *, max_bytes: int = MAX_UPLOAD_BYTES) -> pd.DataFrame:
    if not payload:
        raise UploadedPackageValidationError({"error": "empty_file", "message": "CSV file is empty."})
    if len(payload) > max_bytes:
        raise UploadedPackageValidationError(
            {"error": "file_too_large", "max_bytes": max_bytes, "actual_bytes": len(payload)}
        )
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise UploadedPackageValidationError(
            {"error": "invalid_encoding", "message": "CSV must be UTF-8 encoded."}
        ) from exc
    try:
        frame = pd.read_csv(StringIO(text), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise UploadedPackageValidationError({"error": "csv_parse_error", "message": str(exc)[:240]}) from exc
    return frame


def _invalid_rows(frame: pd.DataFrame, column: str, parsed: pd.Series) -> list[int]:
    original = frame[column].astype(str).str.strip()
    mask = original.ne("") & parsed.isna()
    return [int(index) + 2 for index in frame.index[mask]]


def validate_uploaded_frame(frame: pd.DataFrame, *, max_rows: int = MAX_UPLOAD_ROWS) -> None:
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise UploadedPackageValidationError({"error": "missing_required_columns", "missing_columns": missing})
    if frame.empty:
        raise UploadedPackageValidationError({"error": "empty_file", "message": "CSV contains no data rows."})
    if len(frame) > max_rows:
        raise UploadedPackageValidationError(
            {"error": "too_many_rows", "max_rows": max_rows, "actual_rows": int(len(frame))}
        )

    for column in REQUIRED_COLUMNS:
        blank_rows = [int(index) + 2 for index in frame.index[frame[column].astype(str).str.strip().eq("")]]
        if blank_rows:
            raise UploadedPackageValidationError(
                {"error": "blank_required_fields", "fields": [{"column": column, "rows": blank_rows}]}
            )

    numeric_errors = []
    for column in NUMERIC_COLUMNS:
        parsed = pd.to_numeric(frame[column], errors="coerce")
        rows = _invalid_rows(frame, column, parsed)
        if rows:
            numeric_errors.append({"column": column, "rows": rows})
    if numeric_errors:
        raise UploadedPackageValidationError({"error": "invalid_numeric_fields", "fields": numeric_errors})

    date_errors = []
    for column in DATE_COLUMNS:
        if column not in frame.columns:
            continue
        parsed = pd.to_datetime(frame[column], errors="coerce", utc=True)
        rows = _invalid_rows(frame, column, parsed)
        if rows:
            date_errors.append({"column": column, "rows": rows})
    if date_errors:
        raise UploadedPackageValidationError({"error": "invalid_date_fields", "fields": date_errors})


def normalize_uploaded_rows(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    for column in OPTIONAL_COLUMNS:
        if column not in normalized.columns:
            normalized[column] = ""

    normalized["currency"] = normalized["currency"].replace("", "IDR")
    normalized["tender_value_amount"] = pd.to_numeric(normalized["tender_value_amount"], errors="coerce")
    normalized["award_value_amount"] = pd.to_numeric(normalized["award_value_amount"], errors="coerce")
    normalized["tender_value_currency"] = normalized["currency"]
    normalized["award_value_currency"] = normalized["currency"]
    normalized["tender_items_count"] = 1
    normalized["award_items_count"] = 1
    normalized["award_status"] = normalized["tender_status"].replace("", "complete")
    normalized["contract_value_amount"] = normalized["award_value_amount"]
    normalized["contract_dateSigned"] = normalized["award_date"]
    normalized["source_split"] = SOURCE_SPLIT
    normalized["eval_claim_scope"] = EVAL_CLAIM_SCOPE
    normalized["is_heldout"] = False

    if "ocid" in normalized:
        generated = [f"uploaded-{index + 1}" for index in range(len(normalized))]
        normalized["ocid"] = normalized["ocid"].where(normalized["ocid"].astype(str).str.strip().ne(""), generated)
    if "tender_id" in normalized:
        generated = [f"UPLOAD-{index + 1}" for index in range(len(normalized))]
        normalized["tender_id"] = normalized["tender_id"].where(normalized["tender_id"].astype(str).str.strip().ne(""), generated)

    return normalized.reset_index(drop=True)
```

- [ ] **Step 4: Run validation tests**

Run:

```bash
pytest tests/test_uploaded_packages.py -q
```

Expected: PASS for the validation tests.

- [ ] **Step 5: Git checkpoint**

Do not run Git automatically. This repository requires explicit user confirmation before `git add` or `git commit`.

If the user confirms, use this Lore-style message:

```text
Define uploaded tender CSV validation boundary

Constraint: Upload scoring must not mutate train/test artifacts or retrain models.
Confidence: high
Scope-risk: narrow
Directive: Keep upload parsing isolated from held-out and archive paths.
Tested: pytest tests/test_uploaded_packages.py -q
```

## Task 2: Upload Scoring Runtime

**Files:**
- Modify: `src/uploaded_packages.py`
- Modify: `tests/test_uploaded_packages.py`

- [ ] **Step 1: Add failing scoring tests**

Append to `tests/test_uploaded_packages.py`:

```python
from src.uploaded_packages import build_uploaded_package_scores


def test_build_uploaded_package_scores_returns_ranked_uploaded_rows():
    result = build_uploaded_package_scores(VALID_CSV.encode("utf-8"))

    assert result.metadata.source_split == SOURCE_SPLIT
    assert result.metadata.eval_claim_scope == EVAL_CLAIM_SCOPE
    assert result.metadata.rows_received == 2
    assert result.metadata.rows_scored == 2
    assert result.metadata.no_retraining is True
    assert result.metadata.no_cloud_call is True
    assert result.metadata.no_live_scraping is True
    assert len(result.items) == 2
    assert result.items[0]["source_split"] == SOURCE_SPLIT
    assert result.items[0]["eval_claim_scope"] == EVAL_CLAIM_SCOPE
    assert result.items[0]["is_heldout"] is False
    assert result.items[0]["risk_rank"] == 1
    assert {"probability_low", "probability_medium", "probability_high"} <= set(result.items[0])


def test_uploaded_features_align_with_model_feature_names():
    result = build_uploaded_package_scores(VALID_CSV.encode("utf-8"))

    assert result.feature_columns
    assert set(result.model_feature_names).issubset(set(result.feature_columns))
```

- [ ] **Step 2: Run tests to verify scoring behavior fails**

Run:

```bash
pytest tests/test_uploaded_packages.py::test_build_uploaded_package_scores_returns_ranked_uploaded_rows -q
```

Expected: FAIL with `ImportError` or `AttributeError` because `build_uploaded_package_scores` is not implemented.

- [ ] **Step 3: Add scoring result dataclass and function**

Add this to `src/uploaded_packages.py`:

```python
@dataclass(frozen=True)
class UploadedPackageScoreResult:
    metadata: UploadedPackageMetadata
    items: list[dict[str, Any]]
    warnings: list[str]
    feature_columns: list[str]
    model_feature_names: list[str]


def _queue_items_for_uploaded_rows(queue: pd.DataFrame) -> list[dict[str, Any]]:
    if queue.empty:
        return []
    prepared = queue.copy()
    prepared.insert(0, "upload_rank", range(1, len(prepared) + 1))
    prepared["source_split"] = SOURCE_SPLIT
    prepared["eval_claim_scope"] = EVAL_CLAIM_SCOPE
    prepared["is_heldout"] = False
    prepared["case_id"] = "uploaded_csv:" + prepared["row_id"].astype(str)
    return prepared.where(pd.notna(prepared), None).to_dict(orient="records")


def build_uploaded_package_scores(
    payload: bytes,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    max_rows: int = MAX_UPLOAD_ROWS,
) -> UploadedPackageScoreResult:
    started = perf_counter()

    data_started = perf_counter()
    frame = parse_uploaded_csv(payload, max_bytes=max_bytes)
    validate_uploaded_frame(frame, max_rows=max_rows)
    raw = normalize_uploaded_rows(frame)
    data_load_latency_ms = (perf_counter() - data_started) * 1000

    feature_started = perf_counter()
    features = compute_all_features(raw)
    feature_latency_ms = (perf_counter() - feature_started) * 1000

    model_started = perf_counter()
    backend = load_prediction_backend()
    model_load_latency_ms = (perf_counter() - model_started) * 1000

    prediction_started = perf_counter()
    predictions = predict_risk_scores(features, backend)
    prediction_latency_ms = (perf_counter() - prediction_started) * 1000

    queue_started = perf_counter()
    dataset = DemoDataset(
        features=features,
        raw=raw,
        feature_path=Path(UPLOAD_FEATURE_SOURCE),
        raw_path=Path(UPLOAD_RAW_SOURCE),
        max_rows=max_rows,
    )
    queue = build_risk_queue(dataset, predictions, top_n=None)
    items = _queue_items_for_uploaded_rows(queue)
    queue_build_latency_ms = (perf_counter() - queue_started) * 1000

    metadata = UploadedPackageMetadata(
        upload_id=uuid4().hex,
        model_artifact=Path(backend.model_artifact).name,
        model_backend=backend.kind,
        feature_source=UPLOAD_FEATURE_SOURCE,
        raw_source=UPLOAD_RAW_SOURCE,
        source_split=SOURCE_SPLIT,
        eval_claim_scope=EVAL_CLAIM_SCOPE,
        rows_received=int(len(frame)),
        rows_scored=int(len(features)),
        rows_ranked=int(len(items)),
        data_load_latency_ms=round(data_load_latency_ms, 3),
        feature_latency_ms=round(feature_latency_ms, 3),
        model_load_latency_ms=round(model_load_latency_ms, 3),
        prediction_latency_ms=round(prediction_latency_ms, 3),
        queue_build_latency_ms=round(queue_build_latency_ms, 3),
        total_latency_ms=round((perf_counter() - started) * 1000, 3),
    )
    return UploadedPackageScoreResult(
        metadata=metadata,
        items=items,
        warnings=[],
        feature_columns=list(features.columns),
        model_feature_names=list(backend.feature_names),
    )
```

- [ ] **Step 4: Run upload scoring tests**

Run:

```bash
pytest tests/test_uploaded_packages.py -q
```

Expected: PASS.

- [ ] **Step 5: Git checkpoint**

Do not run Git automatically. If confirmed by the user, use:

```text
Score uploaded tender CSV rows with existing model

Constraint: Upload scoring is runtime inference only; no training/HPO/export calls are allowed.
Rejected: Merging uploads into archive analytics | It would blur uploaded rows with prepared split data.
Confidence: high
Scope-risk: moderate
Directive: Uploaded rows must keep source_split=uploaded_csv and eval_claim_scope=uploaded_scoring_only.
Tested: pytest tests/test_uploaded_packages.py -q
```

## Task 3: API Response Schemas

**Files:**
- Modify: `src/api_schemas.py`

- [ ] **Step 1: Add upload schema models**

Append these models after `ArchiveInferenceStatus` in `src/api_schemas.py`:

```python
class UploadedPackageInferenceStatus(BaseModel):
    upload_id: str
    model_artifact: str
    model_backend: str
    inference_mode: str = "offline_local"
    feature_source: str
    raw_source: str
    source_split: str
    eval_claim_scope: str
    rows_received: int
    rows_scored: int
    rows_ranked: int
    data_load_latency_ms: float
    feature_latency_ms: float
    model_load_latency_ms: float
    prediction_latency_ms: float
    queue_build_latency_ms: float
    total_latency_ms: float
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    guardrail: str


class UploadedPackageScoreResponse(BaseModel):
    upload_id: str
    rows_received: int
    rows_scored: int
    source_split: str
    eval_claim_scope: str
    model_artifact: str
    model_backend: str
    feature_source: str
    raw_source: str
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    items: list[dict[str, Any]]
    warnings: list[str]
    inference_status: UploadedPackageInferenceStatus
    guardrail: str
```

- [ ] **Step 2: Run schema import smoke**

Run:

```bash
python - <<'PY'
from backend.api_schemas import UploadedPackageInferenceStatus, UploadedPackageScoreResponse
print(UploadedPackageInferenceStatus.__name__)
print(UploadedPackageScoreResponse.__name__)
PY
```

Expected output:

```text
UploadedPackageInferenceStatus
UploadedPackageScoreResponse
```

- [ ] **Step 3: Git checkpoint**

Do not run Git automatically. If confirmed by the user, use:

```text
Expose upload scoring API contracts

Constraint: Frontend/API consumers need explicit uploaded_csv provenance.
Confidence: high
Scope-risk: narrow
Directive: Do not reuse held-out inference status for uploaded package scoring.
Tested: python schema import smoke
```

## Task 4: FastAPI Upload Endpoints

**Files:**
- Modify: `src/api.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Add failing API tests**

Append to `tests/test_api.py`:

```python
VALID_UPLOAD_CSV = """tender_title,tender_description,buyer_name,supplier_name,tender_value_amount,award_value_amount,tender_datePublished,tender_procurementMethod,tender_mainProcurementCategory,ocid,tender_id,buyer_id,supplier_id,tender_status,award_date,currency
Pembangunan jalan desa,Paket pekerjaan konstruksi jalan desa,Dinas PUPR Kabupaten Sleman,PT Maju Jaya,1500000000,1480000000,2025-01-15,open,works,ocds-upload-1,TDR-1,BYR-1,SUP-1,complete,2025-02-20,IDR
Pengadaan laptop sekolah,Pengadaan perangkat laptop untuk sekolah,Dinas Pendidikan Kota Bandung,CV Teknologi Nusantara,750000000,760000000,2025-02-11,open,goods,ocds-upload-2,TDR-2,BYR-2,SUP-2,complete,2025-03-10,IDR
"""


def test_upload_template_endpoint_returns_csv_template():
    response = client.get("/api/uploads/tender-packages/template")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "tender_title,tender_description,buyer_name" in response.text
    assert "Pembangunan jalan desa" in response.text


def test_upload_tender_packages_scores_uploaded_csv_without_retraining():
    response = client.post(
        "/api/uploads/tender-packages",
        content=VALID_UPLOAD_CSV.encode("utf-8"),
        headers={"content-type": "text/csv"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows_received"] == 2
    assert payload["rows_scored"] == 2
    assert payload["source_split"] == "uploaded_csv"
    assert payload["eval_claim_scope"] == "uploaded_scoring_only"
    assert payload["feature_source"] == "uploaded_csv"
    assert payload["raw_source"] == "uploaded_csv"
    assert payload["no_retraining"] is True
    assert payload["no_cloud_call"] is True
    assert payload["no_live_scraping"] is True
    assert len(payload["items"]) == 2
    assert payload["items"][0]["source_split"] == "uploaded_csv"
    assert payload["items"][0]["eval_claim_scope"] == "uploaded_scoring_only"
    assert payload["items"][0]["is_heldout"] is False
    assert "bukan tuduhan pelanggaran" in payload["guardrail"]


def test_upload_tender_packages_rejects_missing_required_column():
    csv_text = VALID_UPLOAD_CSV.replace("supplier_name,", "")
    response = client.post(
        "/api/uploads/tender-packages",
        content=csv_text.encode("utf-8"),
        headers={"content-type": "text/csv"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["error"] == "missing_required_columns"
    assert detail["missing_columns"] == ["supplier_name"]
    assert "guardrail" in detail
```

- [ ] **Step 2: Run API tests to verify endpoint fails**

Run:

```bash
pytest tests/test_api.py::test_upload_template_endpoint_returns_csv_template -q
```

Expected: FAIL with `404`.

- [ ] **Step 3: Wire schemas and upload helpers into `src/api.py`**

Add these imports near the existing imports in `src/api.py`:

```python
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
```

Add these schema imports from `backend.api_schemas`:

```python
    UploadedPackageInferenceStatus,
    UploadedPackageScoreResponse,
```

Add this helper import block after the `src.product_demo` imports:

```python
from src.uploaded_packages import (
    UploadedPackageValidationError,
    build_uploaded_package_scores,
    generate_template_csv,
)
```

- [ ] **Step 4: Add upload response adapter and endpoints**

Add this helper before route declarations:

```python
def _uploaded_package_response(result: Any) -> UploadedPackageScoreResponse:
    metadata = result.metadata
    status = UploadedPackageInferenceStatus(**asdict(metadata))
    return UploadedPackageScoreResponse(
        upload_id=metadata.upload_id,
        rows_received=metadata.rows_received,
        rows_scored=metadata.rows_scored,
        source_split=metadata.source_split,
        eval_claim_scope=metadata.eval_claim_scope,
        model_artifact=metadata.model_artifact,
        model_backend=metadata.model_backend,
        feature_source=metadata.feature_source,
        raw_source=metadata.raw_source,
        no_cloud_call=metadata.no_cloud_call,
        no_live_scraping=metadata.no_live_scraping,
        no_retraining=metadata.no_retraining,
        items=result.items,
        warnings=result.warnings,
        inference_status=status,
        guardrail=metadata.guardrail,
    )
```

Add these routes before the catch-all frontend routes:

```python
@app.get("/api/uploads/tender-packages/template", response_model=None)
def tender_package_upload_template() -> Response:
    return Response(
        content=generate_template_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=lpse-x-tender-packages-template.csv"},
    )


@app.post("/api/uploads/tender-packages", response_model=UploadedPackageScoreResponse)
async def upload_tender_packages(request: Request) -> UploadedPackageScoreResponse:
    payload = await request.body()
    try:
        result = build_uploaded_package_scores(payload)
        return _uploaded_package_response(result)
    except UploadedPackageValidationError as exc:
        detail = dict(exc.detail)
        detail["guardrail"] = SAFE_GUARDRAIL_ID
        raise HTTPException(status_code=400, detail=detail) from exc
    except DemoRuntimeError:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"error": _safe_error(exc), "guardrail": SAFE_GUARDRAIL_ID},
        ) from exc
```

- [ ] **Step 5: Run API upload tests**

Run:

```bash
pytest tests/test_api.py::test_upload_template_endpoint_returns_csv_template tests/test_api.py::test_upload_tender_packages_scores_uploaded_csv_without_retraining tests/test_api.py::test_upload_tender_packages_rejects_missing_required_column -q
```

Expected: PASS.

- [ ] **Step 6: Git checkpoint**

Do not run Git automatically. If confirmed by the user, use:

```text
Add tender CSV upload scoring endpoints

Constraint: Upload API must accept local CSV text without adding multipart dependencies.
Rejected: Uploading directly into archive endpoints | It would mix user uploads with prepared split artifacts.
Confidence: high
Scope-risk: moderate
Directive: Keep upload endpoints under /api/uploads and preserve held-out queue semantics.
Tested: pytest targeted upload API tests
```

## Task 5: Runtime Guardrail Coverage

**Files:**
- Modify: `tests/test_no_retraining.py`

- [ ] **Step 1: Add upload module to runtime guardrail scan**

Modify `PRODUCT_SURFACES` in `tests/test_no_retraining.py`:

```python
PRODUCT_SURFACES = [
    PROJECT_ROOT / "src" / "artifacts.py",
    PROJECT_ROOT / "src" / "product_demo.py",
    PROJECT_ROOT / "src" / "casebook.py",
    PROJECT_ROOT / "src" / "api.py",
    PROJECT_ROOT / "src" / "uploaded_packages.py",
]
```

- [ ] **Step 2: Run no-retraining guardrail**

Run:

```bash
pytest tests/test_no_retraining.py -q
```

Expected: PASS.

If this fails because `to_csv(` appears in `generate_template_csv`, replace the implementation with `csv.DictWriter` from the Python standard library:

```python
from io import StringIO
import csv


def generate_template_csv() -> str:
    sample = {
        "tender_title": "Pembangunan jalan desa",
        "tender_description": "Paket pekerjaan konstruksi jalan desa",
        "buyer_name": "Dinas PUPR Kabupaten Sleman",
        "supplier_name": "PT Maju Jaya",
        "tender_value_amount": "1500000000",
        "award_value_amount": "1480000000",
        "tender_datePublished": "2025-01-15",
        "tender_procurementMethod": "open",
        "tender_mainProcurementCategory": "works",
        "ocid": "ocds-upload-sample-1",
        "tender_id": "TDR-SAMPLE-1",
        "buyer_id": "BUYER-SAMPLE-1",
        "supplier_id": "SUPPLIER-SAMPLE-1",
        "tender_status": "complete",
        "award_date": "2025-02-20",
        "currency": "IDR",
    }
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=TEMPLATE_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow(sample)
    return buffer.getvalue()
```

Then rerun:

```bash
pytest tests/test_no_retraining.py tests/test_uploaded_packages.py -q
```

Expected: PASS.

- [ ] **Step 3: Git checkpoint**

Do not run Git automatically. If confirmed by the user, use:

```text
Guard upload scoring against runtime retraining

Constraint: Product runtime tests block training, artifact export, and parquet/CSV writes.
Rejected: Excluding uploaded_packages.py from guardrail scan | It would leave the new runtime surface unprotected.
Confidence: high
Scope-risk: narrow
Directive: Any new upload runtime helper must stay inside PRODUCT_SURFACES.
Tested: pytest tests/test_no_retraining.py tests/test_uploaded_packages.py -q
```

## Task 6: Final Verification

**Files:**
- Read/verify only unless failures require fixes.

- [ ] **Step 1: Run focused Python tests**

Run:

```bash
pytest tests/test_uploaded_packages.py tests/test_no_retraining.py -q
```

Expected: PASS.

- [ ] **Step 2: Run targeted API tests**

Run:

```bash
pytest tests/test_api.py::test_upload_template_endpoint_returns_csv_template tests/test_api.py::test_upload_tender_packages_scores_uploaded_csv_without_retraining tests/test_api.py::test_upload_tender_packages_rejects_missing_required_column -q
```

Expected: PASS.

- [ ] **Step 3: Run broader API smoke if time allows**

Run:

```bash
pytest tests/test_api.py::test_health_returns_offline_guardrail_contract tests/test_api.py::test_inference_status_endpoint_and_queue_payload_limit tests/test_api.py::test_upload_tender_packages_scores_uploaded_csv_without_retraining -q
```

Expected: PASS.

- [ ] **Step 4: Check Git diff**

Run:

```bash
git diff -- src/uploaded_packages.py src/api.py src/api_schemas.py tests/test_uploaded_packages.py tests/test_api.py tests/test_no_retraining.py
```

Expected: Diff touches only upload scoring module, API contracts/routes, and tests.

- [ ] **Step 5: Final report**

Report:

- changed files
- tests run and pass/fail status
- confirmation that `train_data/`, `test_data/`, and model artifacts were not modified
- any remaining risks, especially real-model test runtime cost

Do not stage or commit unless the user explicitly confirms the exact files and commit message.

## Plan Self-Review

Spec coverage:

- CSV template upload: Task 1 and Task 4.
- Validation and actionable errors: Task 1 and Task 4.
- Feature generation with existing `compute_all_features`: Task 2.
- Existing model scoring only: Task 2.
- Separate uploaded provenance labels: Task 1, Task 2, Task 4.
- No retraining/artifact mutation guardrail: Task 5 and Task 6.
- No archive analytics merge: enforced by file boundaries and non-goals in Task 4.

Placeholder scan:

- No unresolved placeholder sections remain.
- Git steps are explicit checkpoint instructions but intentionally require user confirmation because this repo's `AGENTS.md` requires it.

Type consistency:

- `UploadedPackageMetadata`, `UploadedPackageScoreResult`, `UploadedPackageInferenceStatus`, and `UploadedPackageScoreResponse` use matching field names.
- API route returns the response model via `_uploaded_package_response`.
- Tests reference constants and functions defined in the implementation tasks.
