"""CSV upload validation, normalization, and offline tender scoring.

This module scores user-uploaded rows through the accepted local inference
artifact only. It does not train models, scrape data, call cloud services,
export model artifacts, or mutate prepared train/test artifacts.
"""

from __future__ import annotations

import csv
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
    """Validation failure with API-ready structured details."""

    def __init__(self, detail: dict[str, Any]):
        self.detail = detail
        super().__init__(str(detail))


@dataclass(frozen=True)
class UploadedPackageMetadata:
    """Future scoring metadata for uploaded CSV inference runs."""

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


@dataclass(frozen=True)
class UploadedPackageScoreResult:
    """Scored upload payload plus diagnostics useful for tests and API mapping."""

    metadata: UploadedPackageMetadata
    items: list[dict[str, Any]]
    warnings: list[str]
    feature_columns: list[str]
    model_feature_names: list[str]


def generate_template_csv() -> str:
    """Return a UTF-8 CSV template with one representative row."""

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=TEMPLATE_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow(
        {
            "tender_title": "Pembangunan jalan desa",
            "tender_description": "Paket pekerjaan konstruksi jalan desa",
            "buyer_name": "Dinas PUPR Kabupaten Sleman",
            "supplier_name": "PT Maju Jaya",
            "tender_value_amount": "1500000000",
            "award_value_amount": "1480000000",
            "tender_datePublished": "2025-01-15",
            "tender_procurementMethod": "open",
            "tender_mainProcurementCategory": "works",
            "ocid": "ocds-upload-1",
            "tender_id": "UPLOAD-1",
            "buyer_id": "BUYER-1",
            "supplier_id": "SUPPLIER-1",
            "tender_status": "complete",
            "award_date": "2025-02-20",
            "currency": "IDR",
        }
    )
    return output.getvalue()


def parse_uploaded_csv(payload: bytes, max_bytes: int = MAX_UPLOAD_BYTES) -> pd.DataFrame:
    """Decode and parse an uploaded CSV payload as strings."""

    if not payload:
        raise UploadedPackageValidationError(
            {"error": "empty_file", "message": "CSV file is empty."}
        )
    if len(payload) > max_bytes:
        raise UploadedPackageValidationError(
            {"error": "file_too_large", "max_bytes": max_bytes, "actual_bytes": len(payload)}
        )

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise UploadedPackageValidationError(
            {"error": "invalid_encoding", "message": "CSV must be UTF-8 encoded."}
        ) from exc

    try:
        return pd.read_csv(StringIO(text), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise UploadedPackageValidationError(
            {"error": "csv_parse_error", "message": str(exc)[:240]}
        ) from exc


def validate_uploaded_frame(frame: pd.DataFrame, max_rows: int = MAX_UPLOAD_ROWS) -> None:
    """Validate required schema and user-correctable field values."""

    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise UploadedPackageValidationError(
            {"error": "missing_required_columns", "missing_columns": missing}
        )
    if frame.empty:
        raise UploadedPackageValidationError(
            {"error": "empty_file", "message": "CSV contains no data rows."}
        )
    if len(frame) > max_rows:
        raise UploadedPackageValidationError(
            {"error": "too_many_rows", "max_rows": max_rows, "actual_rows": len(frame)}
        )

    blank_fields = []
    for column in REQUIRED_COLUMNS:
        blank_rows = _csv_line_numbers(frame[column].astype(str).str.strip() == "")
        if blank_rows:
            blank_fields.append({"column": column, "rows": blank_rows})
    if blank_fields:
        raise UploadedPackageValidationError(
            {"error": "blank_required_fields", "fields": blank_fields}
        )

    numeric_fields = []
    for column in NUMERIC_COLUMNS:
        invalid_rows = _csv_line_numbers(pd.to_numeric(frame[column], errors="coerce").isna())
        if invalid_rows:
            numeric_fields.append({"column": column, "rows": invalid_rows})
    if numeric_fields:
        raise UploadedPackageValidationError(
            {"error": "invalid_numeric_fields", "fields": numeric_fields}
        )

    date_fields = []
    for column in DATE_COLUMNS:
        if column not in frame.columns:
            continue
        values = frame[column].astype(str).str.strip()
        required_or_present = values != ""
        parsed = pd.to_datetime(values, errors="coerce", format="%Y-%m-%d")
        invalid = required_or_present & parsed.isna()
        invalid_rows = _csv_line_numbers(invalid)
        if invalid_rows:
            date_fields.append({"column": column, "rows": invalid_rows})
    if date_fields:
        raise UploadedPackageValidationError(
            {"error": "invalid_date_fields", "fields": date_fields}
        )


def normalize_uploaded_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Return uploaded rows with stable local provenance and raw defaults."""

    normalized = frame.copy()
    for column in OPTIONAL_COLUMNS:
        if column not in normalized.columns:
            normalized[column] = ""

    normalized["currency"] = normalized["currency"].astype(str).str.strip().replace("", "IDR")
    for column in NUMERIC_COLUMNS:
        normalized[column] = pd.to_numeric(normalized[column], errors="raise")

    normalized["tender_value_currency"] = normalized["currency"]
    normalized["award_value_currency"] = normalized["currency"]
    normalized["tender_tenderPeriod_startDate"] = normalized["tender_datePublished"]
    normalized["tender_items_count"] = 1
    normalized["award_items_count"] = 1
    normalized["award_status"] = (
        normalized["tender_status"].astype(str).str.strip().replace("", "complete")
    )
    normalized["contract_value_amount"] = normalized["award_value_amount"]
    normalized["contract_dateSigned"] = normalized["award_date"]
    normalized["source_split"] = SOURCE_SPLIT
    normalized["eval_claim_scope"] = EVAL_CLAIM_SCOPE
    normalized["is_heldout"] = False

    row_numbers = range(1, len(normalized) + 1)
    normalized["ocid"] = [
        value if str(value).strip() else f"uploaded-{row_number}"
        for value, row_number in zip(normalized["ocid"], row_numbers)
    ]
    normalized["tender_id"] = [
        value if str(value).strip() else f"UPLOAD-{row_number}"
        for value, row_number in zip(normalized["tender_id"], row_numbers)
    ]
    return normalized.reset_index(drop=True)


def build_uploaded_package_scores(
    payload: bytes,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    max_rows: int = MAX_UPLOAD_ROWS,
) -> UploadedPackageScoreResult:
    """Score uploaded tender CSV rows with the existing local model artifact."""

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


def _csv_line_numbers(mask: pd.Series) -> list[int]:
    return [
        line_number
        for line_number, is_invalid in enumerate(mask.tolist(), start=2)
        if bool(is_invalid)
    ]
