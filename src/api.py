"""FastAPI backend for the modern LPSE-X React command center.

The API wraps the existing local/offline adapters only. It does not scrape,
retrain, call cloud services, or export/replace model artifacts.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from dataclasses import asdict, fields, replace
from functools import lru_cache
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock, Thread
from time import sleep
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api_schemas import (
    ArchiveAnalyticsResponse,
    ArchiveBrowserResponse,
    ArchiveInferenceStatus,
    DatasetBrowserResponse,
    DemoStateResponse,
    HealthResponse,
    InferenceStatus,
    ProductionBuildStatus,
    QueueResponse,
    ReviewListResponse,
    ReviewRecord,
    ReviewUpdateRequest,
    StaticCasebookResponse,
)
from src.casebook import DEFAULT_STATIC_CASEBOOK_PATH, build_casebook, render_static_casebook_html
from src.product_demo import (
    ARCHIVE_SPLIT_PATHS,
    ArchiveInferenceMetadata,
    InferenceRunMetadata,
    SAFE_GUARDRAIL_ID,
    build_archive_inference_run,
    build_inference_run,
    format_currency,
    normalize_region_key,
)
from src.reviews import DEFAULT_REVIEW_STATUS, REVIEW_STATUSES, ReviewStore, utc_now_iso

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
ASSETS_DIR = FRONTEND_DIST / "assets"
DEFAULT_QUEUE_TOP_N = 50
MAX_QUEUE_TOP_N = 500
DEFAULT_DATASET_PAGE_SIZE = 12
DEFAULT_ARCHIVE_PAGE_SIZE = 100
DEFAULT_REVIEW_PAGE_SIZE = 100
MAX_DATASET_PAGE_SIZE = 100
ARCHIVE_ANALYTICS_POINT_LIMIT = 500
ARCHIVE_ANALYTICS_PER_TIER_POINTS = 120
ARCHIVE_ANALYTICS_TOP_VALUE_POINTS = 140
ARCHIVE_CONCENTRATION_LIMIT = 12
ARCHIVE_RUNTIME_CACHE_SCHEMA = 1
ARCHIVE_ANALYTICS_RESPONSE_CACHE_MAXSIZE = 64
ARCHIVE_ANALYTICS_PREWARM_DELAY_SECONDS = 8
# Read-only, local preview cache. The FastAPI product path may consume this
# ignored .omx artifact when an operator pre-warms it, but it never writes or
# exports data/model artifacts at runtime.
ARCHIVE_RUNTIME_CACHE_DIR = PROJECT_ROOT / ".omx" / "runtime"
ARCHIVE_QUEUE_CACHE_PATH = ARCHIVE_RUNTIME_CACHE_DIR / "archive_queue.parquet"
ARCHIVE_METADATA_CACHE_PATH = ARCHIVE_RUNTIME_CACHE_DIR / "archive_metadata.json"
REVIEW_DB_PATH = PROJECT_ROOT / "review_data" / "reviews.sqlite3"
REGION_MAP_ASSET_PATH = PROJECT_ROOT / "frontend" / "src" / "assets" / "maps" / "indonesia-kabupaten-kota.geojson"
REGION_MAP_ATTRIBUTION_PATH = PROJECT_ROOT / "docs" / "indonesia-kabupaten-kota-geojson-attribution.md"
REGION_MAP_SOURCE_URL = (
    "https://raw.githubusercontent.com/ardian28/GeoJson-Indonesia-38-Provinsi/"
    "486e89ca57c9f9910991dbf00afca26297b3baa3/Kabupaten/"
    "38%20Provinsi%20Indonesia%20-%20Kabupaten.json"
)
REGION_MAP_SOURCE_COMMIT = "486e89ca57c9f9910991dbf00afca26297b3baa3"
REGION_MAP_LICENSE = "MIT"
LOGGER = logging.getLogger(__name__)
_ARCHIVE_RUNTIME_LOCK = Lock()
_ARCHIVE_RUNTIME_CACHE: tuple[Any, pd.DataFrame, ArchiveInferenceMetadata] | None = None
_ARCHIVE_ANALYTICS_RESPONSE_LOCK = Lock()
_ARCHIVE_ANALYTICS_RESPONSE_CACHE: dict[tuple[str, str, str, str, str, str, str], ArchiveAnalyticsResponse] = {}


def _frontend_index() -> Path:
    return FRONTEND_DIST / "index.html"


def _frontend_asset(asset_path: str) -> Path:
    return FRONTEND_DIST / "assets" / asset_path


GOLDEN_PATH_STEPS = [
    "Open Command Center",
    "Review rank #1 package",
    "Open Explainable Casebook",
    "Inspect factors and provenance",
    "Export casebook HTML",
]


@asynccontextmanager
async def _app_lifespan(_: FastAPI):
    _start_archive_analytics_prewarm()
    yield


app = FastAPI(
    title="LPSE-X Modern Web Command Center",
    version="1.0.0",
    description="Offline-local procurement risk triage API for React/Vite UI.",
    lifespan=_app_lifespan,
)

# Import-time mount supports the normal built bundle. The explicit /assets route
# below keeps tests and monkeypatched dist paths working without reloading app.
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


def _start_archive_analytics_prewarm() -> None:
    """Warm the default archive analytics response without blocking API boot."""
    worker = Thread(
        target=_prewarm_archive_analytics_response,
        name="lpse-archive-analytics-prewarm",
        daemon=True,
    )
    worker.start()


class DemoRuntimeError(RuntimeError):
    """Controlled readiness failure for missing local demo artifacts/data."""


def _safe_error(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}".split("\n", 1)[0][:240]


@lru_cache(maxsize=1)
def _load_runtime() -> tuple[Any, Any, pd.DataFrame, pd.DataFrame, InferenceRunMetadata]:
    try:
        # Full held-out split is scored once and cached; API responses then
        # slice/filter the ranked queue so the frontend never receives all rows.
        return build_inference_run(max_rows=None, top_n=None)
    except Exception as exc:  # pragma: no cover - environment-dependent failure path
        raise DemoRuntimeError(_safe_error(exc)) from exc


def _load_archive_runtime() -> tuple[Any, pd.DataFrame, ArchiveInferenceMetadata]:
    global _ARCHIVE_RUNTIME_CACHE
    if _ARCHIVE_RUNTIME_CACHE is not None:
        return _ARCHIVE_RUNTIME_CACHE

    with _ARCHIVE_RUNTIME_LOCK:
        if _ARCHIVE_RUNTIME_CACHE is not None:
            return _ARCHIVE_RUNTIME_CACHE
        try:
            # Full local archive browsing is a product surface over train_data + test_data.
            # It is intentionally separate from the held-out inference-status proof above.
            cached = _load_archive_runtime_from_disk()
            _ARCHIVE_RUNTIME_CACHE = cached if cached is not None else build_archive_inference_run()
            _ARCHIVE_RUNTIME_CACHE = (
                _ARCHIVE_RUNTIME_CACHE[0],
                _prepare_archive_runtime_queue(_ARCHIVE_RUNTIME_CACHE[1]),
                _ARCHIVE_RUNTIME_CACHE[2],
            )
            return _ARCHIVE_RUNTIME_CACHE
        except Exception as exc:  # pragma: no cover - environment-dependent failure path
            raise DemoRuntimeError(_safe_error(exc)) from exc


def _archive_cache_source_paths() -> list[Path]:
    paths = [PROJECT_ROOT / "model_risk.ubj"]
    for features_path, raw_path in ARCHIVE_SPLIT_PATHS.values():
        paths.extend([features_path, raw_path])
    return paths


def _archive_cache_fingerprint() -> dict[str, dict[str, int]]:
    fingerprint: dict[str, dict[str, int]] = {}
    for path in _archive_cache_source_paths():
        stat = path.stat()
        fingerprint[str(path.relative_to(PROJECT_ROOT))] = {
            "size": int(stat.st_size),
            "mtime_ns": int(stat.st_mtime_ns),
        }
    return fingerprint


def _load_archive_runtime_from_disk() -> tuple[Any, pd.DataFrame, ArchiveInferenceMetadata] | None:
    if not ARCHIVE_QUEUE_CACHE_PATH.is_file() or not ARCHIVE_METADATA_CACHE_PATH.is_file():
        return None
    payload = json.loads(ARCHIVE_METADATA_CACHE_PATH.read_text(encoding="utf-8"))
    if payload.get("schema") != ARCHIVE_RUNTIME_CACHE_SCHEMA:
        return None
    if payload.get("fingerprint") != _archive_cache_fingerprint():
        return None
    metadata_fields = {field.name for field in fields(ArchiveInferenceMetadata)}
    metadata_payload = {key: value for key, value in payload.get("metadata", {}).items() if key in metadata_fields}
    metadata = ArchiveInferenceMetadata(**metadata_payload)
    queue = pd.read_parquet(ARCHIVE_QUEUE_CACHE_PATH)
    return None, queue, metadata


def _prepare_archive_runtime_queue(queue: pd.DataFrame) -> pd.DataFrame:
    prepared = queue.copy()
    if "buyer_region_key" not in prepared:
        region_types = prepared.get("buyer_region_type", pd.Series("", index=prepared.index))
        region_names = prepared.get("buyer_region", pd.Series("", index=prepared.index))
        prepared["buyer_region_key"] = [
            normalize_region_key(region_type, region_name)
            for region_type, region_name in zip(region_types.tolist(), region_names.tolist())
        ]
    prepared["_risk_score_numeric"] = _analytics_numeric(prepared, "risk_priority_score").fillna(0.0)
    prepared["_contract_value_numeric"] = _analytics_numeric(prepared, "tender_value")
    if "predicted_class" in prepared:
        prepared["_is_high"] = pd.to_numeric(prepared["predicted_class"], errors="coerce").eq(2)
    else:
        labels = prepared.get("predicted_label", pd.Series("", index=prepared.index)).astype(str)
        prepared["_is_high"] = labels.str.contains("Tinggi", na=False)
    dates = _archive_dates_utc(prepared)
    prepared["_date_month"] = pd.Series(pd.NA, index=prepared.index, dtype="string")
    valid = dates.notna()
    if valid.any():
        prepared.loc[valid, "_date_month"] = dates.loc[valid].dt.strftime("%Y-%m")
    prepared["_date_valid"] = valid
    return prepared


@lru_cache(maxsize=1)
def _region_map_registry() -> dict[str, dict[str, Any]]:
    if not REGION_MAP_ASSET_PATH.is_file():
        return {}
    payload = json.loads(REGION_MAP_ASSET_PATH.read_text(encoding="utf-8"))
    registry: dict[str, dict[str, Any]] = {}
    for feature in payload.get("features", []):
        properties = feature.get("properties", {})
        map_key = str(properties.get("map_key", "")).strip()
        if not map_key:
            continue
        registry[map_key] = {
            "map_key": map_key,
            "name": str(properties.get("name", "")).strip(),
            "province": str(properties.get("province", "")).strip(),
            "region_type": str(properties.get("region_type", "")).strip(),
        }
    return registry


def _normalize_region_filter_key(region_key: str) -> str:
    text = str(region_key or "").strip()
    if not text:
        return ""
    if text.startswith(("kabupaten-", "kota-", "provinsi-")):
        return text.casefold()
    for region_type in ("kabupaten", "kota", "provinsi"):
        normalized = normalize_region_key(region_type, text)
        if normalized:
            return normalized
    return text.casefold()


def _build_status() -> ProductionBuildStatus:
    return ProductionBuildStatus(
        dist_present=_frontend_index().is_file(),
        served_by_fastapi=True,
        index_html="frontend/dist/index.html",
    )


def _runtime_or_http_error() -> tuple[Any, Any, pd.DataFrame, pd.DataFrame, InferenceRunMetadata]:
    try:
        return _load_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail={"ready": False, "error": str(exc), "guardrail": SAFE_GUARDRAIL_ID},
        ) from exc


def _archive_runtime_or_http_error() -> tuple[Any, pd.DataFrame, ArchiveInferenceMetadata]:
    try:
        return _load_archive_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail={"ready": False, "error": str(exc), "guardrail": SAFE_GUARDRAIL_ID},
        ) from exc


def _archive_analytics_cache_key(
    *,
    risk: str,
    split: str,
    search: str,
    buyer: str,
    supplier: str,
    region_key: str,
    sort: str,
) -> tuple[str, str, str, str, str, str, str]:
    return (
        str(risk or ""),
        str(split or ""),
        str(search or ""),
        str(buyer or ""),
        str(supplier or ""),
        _normalize_region_filter_key(region_key),
        str(sort or ""),
    )


def _archive_analytics_response_cached(
    *,
    risk: str,
    split: str,
    search: str,
    buyer: str,
    supplier: str,
    region_key: str,
    sort: str,
) -> ArchiveAnalyticsResponse:
    """Single-flight cache for expensive archive analytics responses.

    The archive analytics payload scans and groups the full prepared archive.
    Caching repeated filter combinations keeps the public tunnel responsive and
    prevents browser-visible "API down" states during dashboard reloads.
    """
    cache_key = _archive_analytics_cache_key(
        risk=risk,
        split=split,
        search=search,
        buyer=buyer,
        supplier=supplier,
        region_key=region_key,
        sort=sort,
    )
    with _ARCHIVE_ANALYTICS_RESPONSE_LOCK:
        cached = _ARCHIVE_ANALYTICS_RESPONSE_CACHE.get(cache_key)
        if cached is not None:
            return cached

        response = _build_archive_analytics_response(
            risk=risk,
            split=split,
            search=search,
            buyer=buyer,
            supplier=supplier,
            region_key=cache_key[5],
            sort=sort,
        )
        if len(_ARCHIVE_ANALYTICS_RESPONSE_CACHE) >= ARCHIVE_ANALYTICS_RESPONSE_CACHE_MAXSIZE:
            _ARCHIVE_ANALYTICS_RESPONSE_CACHE.pop(next(iter(_ARCHIVE_ANALYTICS_RESPONSE_CACHE)))
        _ARCHIVE_ANALYTICS_RESPONSE_CACHE[cache_key] = response
        return response


def _prewarm_archive_analytics_response() -> None:
    try:
        # Keep cold-start health/demo endpoints responsive before warming the
        # heavier archive aggregate in the background.
        sleep(ARCHIVE_ANALYTICS_PREWARM_DELAY_SECONDS)
        _archive_analytics_response_cached(
            risk="all",
            split="all",
            search="",
            buyer="",
            supplier="",
            region_key="",
            sort="risk_desc",
        )
    except Exception as exc:  # pragma: no cover - best-effort runtime readiness helper
        LOGGER.warning("Archive analytics prewarm failed: %s", _safe_error(exc))


def _records(queue: pd.DataFrame) -> list[dict[str, Any]]:
    return queue.where(pd.notna(queue), None).to_dict(orient="records")


def _inference_status(
    metadata: InferenceRunMetadata,
    *,
    displayed_rows: int | None = None,
    matched_rows: int | None = None,
    queue_limit: int | None = None,
) -> InferenceStatus:
    update: dict[str, Any] = {}
    if displayed_rows is not None:
        update["rows_displayed"] = int(displayed_rows)
    if queue_limit is not None:
        update["queue_limit"] = int(queue_limit)
    shaped = replace(metadata, **update)
    payload = asdict(shaped)
    payload["matched_rows"] = int(matched_rows) if matched_rows is not None else None
    return InferenceStatus(**payload)


def _archive_status(
    metadata: ArchiveInferenceMetadata,
    *,
    displayed_rows: int,
    matched_rows: int,
    queue_limit: int,
) -> ArchiveInferenceStatus:
    payload = asdict(metadata)
    payload["rows_displayed"] = int(displayed_rows)
    payload["matched_rows"] = int(matched_rows)
    payload["queue_limit"] = int(queue_limit)
    return ArchiveInferenceStatus(**payload)


def _summary(queue: pd.DataFrame) -> dict[str, int]:
    if "predicted_class" in queue:
        counts = pd.to_numeric(queue["predicted_class"], errors="coerce").value_counts()
        return {
            "total": int(len(queue)),
            "risiko_tinggi": int(counts.get(2, 0)),
            "risiko_sedang": int(counts.get(1, 0)),
            "risiko_rendah": int(counts.get(0, 0)),
        }
    labels = queue.get("predicted_label", pd.Series(dtype=str)).astype(str)
    return {
        "total": int(len(queue)),
        "risiko_tinggi": int(labels.str.contains("Tinggi", na=False).sum()),
        "risiko_sedang": int(labels.str.contains("Sedang", na=False).sum()),
        "risiko_rendah": int(labels.str.contains("Rendah", na=False).sum()),
    }


def _distribution(queue: pd.DataFrame) -> list[dict[str, Any]]:
    colors = {"Risiko Tinggi": "#EF4444", "Risiko Sedang": "#F59E0B", "Risiko Rendah": "#10B981"}
    summary = _summary(queue)
    return [
        {"label": "Risiko Tinggi", "count": summary["risiko_tinggi"], "color": colors["Risiko Tinggi"]},
        {"label": "Risiko Sedang", "count": summary["risiko_sedang"], "color": colors["Risiko Sedang"]},
        {"label": "Risiko Rendah", "count": summary["risiko_rendah"], "color": colors["Risiko Rendah"]},
    ]


def _trend(queue: pd.DataFrame) -> list[dict[str, Any]]:
    # Deterministic local mini-trend derived from rank buckets, not fabricated dates.
    # The archive endpoint owns the real monthly trend contract.
    # Shape intentionally matches the existing React chart contract.
    if queue.empty:
        return []
    bucket_count = min(6, max(1, len(queue)))
    chunks = [chunk for chunk in np.array_split(queue.head(60), bucket_count) if not chunk.empty]
    rows: list[dict[str, Any]] = []
    for idx, chunk in enumerate(chunks, start=1):
        raw_average = chunk.get("risk_priority_score", pd.Series(dtype=float)).mean()
        average_priority = float(raw_average) if pd.notna(raw_average) else 0.0
        rows.append(
            {
                "bucket": f"Rank-{idx:02d}",
                "average_priority": round(average_priority, 4),
                "review_count": int(len(chunk)),
            }
        )
    return rows


def _filter_ranked_rows(
    queue: pd.DataFrame,
    *,
    risk: str,
    search: str,
    buyer: str,
    supplier: str,
) -> pd.DataFrame:
    filtered = queue
    if risk and risk.lower() != "all":
        filtered = filtered[filtered["predicted_label"].astype(str).str.casefold() == risk.casefold()]
    if search:
        haystack = (
            filtered["case_id"].astype(str)
            + " "
            + filtered["package_title"].astype(str)
            + " "
            + filtered["buyer"].astype(str)
            + " "
            + filtered["supplier"].astype(str)
            + " "
            + filtered.get("ocid", pd.Series("", index=filtered.index)).astype(str)
            + " "
            + filtered.get("tender_id", pd.Series("", index=filtered.index)).astype(str)
            + " "
            + filtered.get("procurement_method", pd.Series("", index=filtered.index)).astype(str)
            + " "
            + filtered.get("category", pd.Series("", index=filtered.index)).astype(str)
            + " "
            + filtered.get("status", pd.Series("", index=filtered.index)).astype(str)
        ).str.casefold()
        filtered = filtered[haystack.str.contains(search.casefold(), regex=False, na=False)]
    if buyer:
        filtered = filtered[filtered["buyer"].astype(str).str.contains(buyer, case=False, regex=False, na=False)]
    if supplier:
        filtered = filtered[filtered["supplier"].astype(str).str.contains(supplier, case=False, regex=False, na=False)]
    return filtered


def _filter_archive_rows(
    queue: pd.DataFrame,
    *,
    risk: str,
    split: str,
    search: str,
    buyer: str,
    supplier: str,
    region_key: str,
    sort: str,
) -> pd.DataFrame:
    filtered = _filter_ranked_rows(queue, risk=risk, search=search, buyer=buyer, supplier=supplier)
    normalized_region_key = _normalize_region_filter_key(region_key)
    if normalized_region_key:
        if "buyer_region_key" not in filtered:
            filtered = filtered.iloc[0:0]
        else:
            filtered = filtered[filtered["buyer_region_key"].fillna("").astype(str).str.casefold() == normalized_region_key]
    normalized_split = split.casefold().strip()
    if normalized_split in {"test_data", "heldout", "held-out", "heldout_test_only"}:
        filtered = filtered[filtered["source_split"].astype(str) == "test_data"]
    elif normalized_split in {"train_data", "train", "training", "archive_browsing_only"}:
        filtered = filtered[filtered["source_split"].astype(str) == "train_data"]
    elif normalized_split not in {"", "all"}:
        filtered = filtered.iloc[0:0]

    if sort == "value_desc" and "tender_value" in filtered:
        sort_value = (
            filtered["_contract_value_numeric"]
            if "_contract_value_numeric" in filtered
            else pd.to_numeric(filtered["tender_value"], errors="coerce")
        )
        filtered = filtered.assign(_sort_value=sort_value.fillna(-1)).sort_values(
            ["_sort_value", "archive_rank"], ascending=[False, True], kind="mergesort"
        ).drop(columns=["_sort_value"])
    elif sort == "date_desc" and "date_published" in filtered:
        filtered = filtered.sort_values(["date_published", "archive_rank"], ascending=[False, True], kind="mergesort")
    elif sort != "risk_desc":
        filtered = filtered.sort_values("archive_rank", ascending=True, kind="mergesort")
    return filtered


def _archive_dates_utc(queue: pd.DataFrame) -> pd.Series:
    if "date_published" in queue:
        source = queue["date_published"]
    elif "tender_datePublished" in queue:
        source = queue["tender_datePublished"]
    else:
        source = pd.Series(pd.NaT, index=queue.index)
    return pd.to_datetime(source, errors="coerce", utc=True)


def _archive_date_range(queue: pd.DataFrame) -> dict[str, Any]:
    if "_date_month" in queue and "_date_valid" in queue:
        months = queue.loc[queue["_date_valid"], "_date_month"].dropna().astype(str)
        if months.empty:
            return {
                "start_month": None,
                "end_month": None,
                "valid_date_rows": 0,
                "invalid_date_rows": int(len(queue)),
            }
        return {
            "start_month": months.min(),
            "end_month": months.max(),
            "valid_date_rows": int(months.size),
            "invalid_date_rows": int((~queue["_date_valid"]).sum()),
        }

    dates = _archive_dates_utc(queue)
    valid_dates = dates.dropna()
    if valid_dates.empty:
        return {
            "start_month": None,
            "end_month": None,
            "valid_date_rows": 0,
            "invalid_date_rows": int(len(queue)),
        }
    return {
        "start_month": valid_dates.min().strftime("%Y-%m"),
        "end_month": valid_dates.max().strftime("%Y-%m"),
        "valid_date_rows": int(valid_dates.size),
        "invalid_date_rows": int(dates.isna().sum()),
    }


def _monthly_risk_trend(queue: pd.DataFrame) -> list[dict[str, Any]]:
    if queue.empty:
        return []

    if "_date_month" in queue and "_date_valid" in queue:
        valid = queue["_date_valid"].astype(bool)
        if not valid.any():
            return []
        trend_columns = ["_date_month", "predicted_label", "_risk_score_numeric"]
        if "predicted_class" in queue:
            trend_columns.append("predicted_class")
        trend_frame = queue.loc[valid, trend_columns].copy()
        month_column = "_date_month"
        priority_column = "_risk_score_numeric"
    else:
        dates = _archive_dates_utc(queue)
        valid = dates.notna()
        if not valid.any():
            return []

        trend_frame = queue.loc[valid].copy()
        trend_frame["_month"] = dates.loc[valid].dt.strftime("%Y-%m")
        trend_frame["_priority"] = pd.to_numeric(
            trend_frame.get("risk_priority_score", pd.Series(0, index=trend_frame.index)),
            errors="coerce",
        )
        month_column = "_month"
        priority_column = "_priority"

    classes = pd.to_numeric(trend_frame.get("predicted_class", pd.Series(np.nan, index=trend_frame.index)), errors="coerce")
    trend_frame = trend_frame.assign(_predicted_class=classes)
    class_counts = trend_frame.groupby([month_column, "_predicted_class"], observed=True).size().unstack(fill_value=0)
    average_priority = trend_frame.groupby(month_column, observed=True)[priority_column].mean()

    rows: list[dict[str, Any]] = []
    for month in class_counts.index.astype(str):
        counts = class_counts.loc[month]
        tinggi = int(counts.get(2, 0))
        sedang = int(counts.get(1, 0))
        rendah = int(counts.get(0, 0))
        total = tinggi + sedang + rendah
        month_average = average_priority.loc[month]
        rows.append(
            {
                "month": str(month),
                "tinggi": tinggi,
                "sedang": sedang,
                "rendah": rendah,
                "total": total,
                "average_priority": round(float(month_average), 4) if pd.notna(month_average) else 0.0,
            }
        )
    return rows


def _archive_columns(queue: pd.DataFrame) -> list[str]:
    preferred = [
        "archive_rank",
        "split_risk_rank",
        "archive_id",
        "case_id",
        "row_id",
        "source_split",
        "is_heldout",
        "eval_claim_scope",
        "ocid",
        "tender_id",
        "package_title",
        "buyer",
        "buyer_region",
        "buyer_region_type",
        "buyer_region_key",
        "buyer_region_source",
        "buyer_region_note",
        "supplier",
        "tender_value_display",
        "procurement_method",
        "category",
        "status",
        "date_published",
        "predicted_label",
        "probability",
        "risk_priority_score",
        "probability_high",
        "probability_medium",
        "probability_low",
        "review_status",
    ]
    return [column for column in preferred if column in queue.columns]


def _label_distribution(queue: pd.DataFrame) -> dict[str, int]:
    summary = _summary(queue)
    return {
        "Risiko_Tinggi": summary["risiko_tinggi"],
        "Risiko_Sedang": summary["risiko_sedang"],
        "Risiko_Rendah": summary["risiko_rendah"],
    }


def _split_distribution(queue: pd.DataFrame) -> dict[str, int]:
    splits = queue.get("source_split", pd.Series(dtype=str)).value_counts()
    return {
        "train_data": int(splits.get("train_data", 0)),
        "test_data": int(splits.get("test_data", 0)),
    }


def _analytics_risk_color(label: str) -> str:
    if "Tinggi" in label:
        return "#EF4444"
    if "Sedang" in label:
        return "#F59E0B"
    if "Rendah" in label:
        return "#10B981"
    return "#64748B"


def _analytics_risk_filter_value(label: Any) -> str:
    text = str(label or "")
    if "Tinggi" in text:
        return "Risiko Tinggi"
    if "Sedang" in text:
        return "Risiko Sedang"
    if "Rendah" in text:
        return "Risiko Rendah"
    return text or "Tidak tersedia"


def _analytics_text(row: pd.Series, column: str, fallback: str = "") -> str:
    value = row.get(column, fallback)
    if value is None or pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def _tender_value_display_for_row(row: pd.Series) -> str:
    existing = _analytics_text(row, "tender_value_display", "")
    if existing:
        return existing
    return format_currency(row.get("tender_value"), _analytics_text(row, "currency", "IDR"))


def _hydrate_tender_value_display(rows: pd.DataFrame) -> pd.DataFrame:
    if rows.empty or "tender_value" not in rows:
        return rows
    hydrated = rows.copy()
    currencies = (
        hydrated["currency"].fillna("IDR").astype(str)
        if "currency" in hydrated
        else pd.Series("IDR", index=hydrated.index, dtype=object)
    )
    hydrated["tender_value_display"] = [
        format_currency(value, currency)
        for value, currency in zip(hydrated["tender_value"].tolist(), currencies.tolist())
    ]
    return hydrated


def _analytics_numeric(queue: pd.DataFrame, column: str, *, default: float = 0.0) -> pd.Series:
    if column not in queue:
        return pd.Series(default, index=queue.index, dtype=float)
    return pd.to_numeric(queue[column], errors="coerce")


def _archive_with_filtered_rank(queue: pd.DataFrame) -> pd.DataFrame:
    ranked = queue.copy(deep=False)
    ranked["_filtered_rank"] = np.arange(1, len(ranked) + 1)
    ranked["_archive_page"] = np.ceil(ranked["_filtered_rank"] / DEFAULT_ARCHIVE_PAGE_SIZE).astype(int)
    if "_risk_score_numeric" not in ranked:
        ranked["_risk_score_numeric"] = _analytics_numeric(ranked, "risk_priority_score").fillna(0.0)
    if "_contract_value_numeric" not in ranked:
        ranked["_contract_value_numeric"] = _analytics_numeric(ranked, "tender_value")
    return ranked


def _archive_priority_map(queue: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ranked = _archive_with_filtered_rank(queue)
    matched_count = int(len(ranked))
    values = ranked["_contract_value_numeric"] if not ranked.empty else pd.Series(dtype=float)
    value_candidates = ranked[values.fillna(0) > 0] if not ranked.empty else ranked
    null_value_rows = int(values.isna().sum()) if not ranked.empty else 0
    zero_value_rows = int((values.notna() & (values <= 0)).sum()) if not ranked.empty else 0

    if ranked.empty:
        return [], {
            "point_limit": ARCHIVE_ANALYTICS_POINT_LIMIT,
            "points_returned": 0,
            "matched_count": 0,
            "total_value_candidates": 0,
            "is_capped": False,
            "sample_strategy": "balanced_120_per_risk_tier_plus_top_140_by_positive_contract_value",
            "null_value_rows": 0,
            "zero_value_rows": 0,
        }

    tier_samples: list[pd.DataFrame] = []
    labels = ranked.get("predicted_label", pd.Series("", index=ranked.index)).astype(str)
    for label in ("Risiko Tinggi", "Risiko Sedang", "Risiko Rendah"):
        tier = ranked[labels.eq(label)]
        if tier.empty:
            continue
        tier_samples.append(
            tier.sort_values(
                ["_risk_score_numeric", "_contract_value_numeric", "_filtered_rank"],
                ascending=[False, False, True],
                kind="mergesort",
            ).head(ARCHIVE_ANALYTICS_PER_TIER_POINTS)
        )
    value_sample = value_candidates.sort_values(
        ["_contract_value_numeric", "_risk_score_numeric", "_filtered_rank"],
        ascending=[False, False, True],
        kind="mergesort",
    ).head(ARCHIVE_ANALYTICS_TOP_VALUE_POINTS)

    sample = pd.concat([*tier_samples, value_sample], axis=0)
    de_dupe_keys = [column for column in ("archive_id", "case_id") if column in sample.columns]
    if de_dupe_keys:
        sample = sample.drop_duplicates(subset=de_dupe_keys, keep="first")
    else:
        sample = sample.loc[~sample.index.duplicated(keep="first")]
    sample = sample.sort_values(
        ["_risk_score_numeric", "_contract_value_numeric", "_filtered_rank"],
        ascending=[False, False, True],
        kind="mergesort",
    ).head(ARCHIVE_ANALYTICS_POINT_LIMIT)

    points: list[dict[str, Any]] = []
    for _, row in sample.iterrows():
        risk_label = _analytics_risk_filter_value(row.get("predicted_label"))
        contract_value = row.get("_contract_value_numeric")
        points.append(
            {
                "archive_id": _analytics_text(row, "archive_id", _analytics_text(row, "case_id", "")),
                "case_id": _analytics_text(row, "case_id", _analytics_text(row, "archive_id", "")),
                "source_split": _analytics_text(row, "source_split", "unknown"),
                "is_heldout": bool(row.get("is_heldout", False)),
                "eval_claim_scope": _analytics_text(row, "eval_claim_scope", "archive_browsing_only"),
                "title": _analytics_text(row, "package_title", "Paket tanpa judul"),
                "buyer": _analytics_text(row, "buyer", "Tidak tersedia"),
                "supplier": _analytics_text(row, "supplier", "Tidak tersedia"),
                "region": _analytics_text(row, "buyer_region", "Belum tersedia"),
                "risk_label": risk_label,
                "filter_value": risk_label,
                "risk_score": round(float(row.get("_risk_score_numeric", 0.0) or 0.0), 6),
                "probability_high": (
                    round(float(row.get("probability_high")), 6)
                    if pd.notna(row.get("probability_high", None))
                    else None
                ),
                "contract_value": (
                    float(contract_value)
                    if pd.notna(contract_value) and float(contract_value) > 0
                    else None
                ),
                "tender_value_display": _tender_value_display_for_row(row),
                "filtered_rank": int(row.get("_filtered_rank", 0)),
                "archive_page": int(row.get("_archive_page", 1)),
            }
        )

    return points, {
        "point_limit": ARCHIVE_ANALYTICS_POINT_LIMIT,
        "points_returned": len(points),
        "matched_count": matched_count,
        "total_value_candidates": int(len(value_candidates)),
        "is_capped": matched_count > len(points),
        "sample_strategy": "balanced_120_per_risk_tier_plus_top_140_by_positive_contract_value",
        "null_value_rows": null_value_rows,
        "zero_value_rows": zero_value_rows,
    }


def _archive_concentration(
    queue: pd.DataFrame,
    *,
    group_column: str,
    sort: str,
    regional: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    matched_count = int(len(queue))
    note = (
        "Buyer region is derived from buyer name text, not official geolocation."
        if regional
        else "Buyer concentration groups exact buyer names from prepared local archive rows."
    )
    meta = {
        "limit": ARCHIVE_CONCENTRATION_LIMIT,
        "returned": 0,
        "matched_count": matched_count,
        "is_capped": False,
        "sort": sort,
        "note": note,
    }
    if queue.empty or group_column not in queue:
        return [], meta

    frame = queue.copy(deep=False)
    frame["_group_label"] = frame[group_column].fillna("").astype(str).str.strip()
    frame.loc[frame["_group_label"] == "", "_group_label"] = "Belum tersedia"
    if "_risk_score_numeric" not in frame:
        frame["_risk_score_numeric"] = _analytics_numeric(frame, "risk_priority_score").fillna(0.0)
    if "_contract_value_numeric" not in frame:
        frame["_contract_value_numeric"] = _analytics_numeric(frame, "tender_value")
    if "_is_high" not in frame:
        frame["_is_high"] = frame.get("predicted_label", pd.Series("", index=frame.index)).astype(str).str.contains("Tinggi", na=False)
    frame["_contract_value_numeric"] = frame["_contract_value_numeric"].fillna(0.0).clip(lower=0)

    aggregations: dict[str, Any] = {
        "count": ("_group_label", "size"),
        "high_risk_count": ("_is_high", "sum"),
        "total_contract_value": ("_contract_value_numeric", "sum"),
        "average_risk_score": ("_risk_score_numeric", "mean"),
    }
    if regional:
        aggregations.update(
            {
                "region": ("buyer_region", "first"),
                "region_type": ("buyer_region_type", "first"),
                "region_source": ("buyer_region_source", "first"),
                "region_note": ("buyer_region_note", "first"),
            }
        )
    else:
        aggregations["buyer"] = ("buyer", "first")

    grouped = frame.groupby("_group_label", sort=False, observed=True).agg(**aggregations).reset_index()
    grouped["percent"] = (grouped["count"] / matched_count * 100).round(2) if matched_count else 0.0
    grouped["high_risk_percent"] = (grouped["high_risk_count"] / grouped["count"] * 100).fillna(0).round(2)
    grouped["total_contract_value"] = grouped["total_contract_value"].round(2)
    grouped["average_risk_score"] = grouped["average_risk_score"].fillna(0).round(6)
    grouped = grouped.sort_values(
        ["high_risk_count", "average_risk_score", "count", "total_contract_value", "_group_label"],
        ascending=[False, False, False, False, False],
        kind="mergesort",
    )

    meta["is_capped"] = len(grouped) > ARCHIVE_CONCENTRATION_LIMIT
    top = grouped.head(ARCHIVE_CONCENTRATION_LIMIT)
    items = []
    for row in top.to_dict(orient="records"):
        item = {
            "label": str(row["_group_label"]),
            "count": int(row["count"]),
            "percent": float(row["percent"]),
            "high_risk_count": int(row["high_risk_count"]),
            "high_risk_percent": float(row["high_risk_percent"]),
            "total_contract_value": float(row["total_contract_value"]),
            "average_risk_score": float(row["average_risk_score"]),
            "region": str(row.get("region", row["_group_label"])) if regional else None,
            "region_type": str(row.get("region_type") or "") or None,
            "region_source": str(row.get("region_source") or "") or None,
            "region_note": str(row.get("region_note") or "") or None,
            "buyer": str(row.get("buyer", row["_group_label"])) if not regional else None,
        }
        items.append(item)
    meta["returned"] = len(items)
    return items, meta


def _archive_region_map(queue: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    registry = _region_map_registry()
    matched_count = int(len(queue))
    meta = {
        "asset_path": "frontend/src/assets/maps/indonesia-kabupaten-kota.geojson",
        "attribution_path": "docs/indonesia-kabupaten-kota-geojson-attribution.md",
        "source_url": REGION_MAP_SOURCE_URL,
        "source_commit": REGION_MAP_SOURCE_COMMIT,
        "license": REGION_MAP_LICENSE,
        "feature_count": len(registry),
        "matched_count": matched_count,
        "regions_returned": 0,
        "matched_regions": 0,
        "mapped_regions": 0,
        "unmatched_regions": 0,
        "unsupported_regions": 0,
        "unsupported_level_regions": 0,
        "source_note": (
            "Buyer region is derived from buyer name text and joined to offline kabupaten/kota "
            "map keys only as a navigation aid; provinsi/unknown levels are unsupported and "
            "unmatched regions are not fabricated."
        ),
        "geojson_source": REGION_MAP_SOURCE_URL,
        "geojson_license": REGION_MAP_LICENSE,
        "map_granularity": "kabupaten_kota",
        "note": (
            "Buyer region is derived from buyer name text and joined to offline kabupaten/kota "
            "map keys only as a navigation aid; provinsi/unknown levels are unsupported and "
            "unmatched regions are not fabricated."
        ),
    }
    if queue.empty or "buyer_region" not in queue:
        return [], meta

    frame = queue.copy(deep=False)
    frame["_region_label"] = frame["buyer_region"].fillna("").astype(str).str.strip()
    frame.loc[frame["_region_label"] == "", "_region_label"] = "Tidak tersedia"
    region_types = frame.get("buyer_region_type", pd.Series("unknown", index=frame.index)).fillna("unknown").astype(str)
    frame["_region_type"] = region_types.str.casefold()
    if "buyer_region_key" in frame:
        frame["_region_key"] = frame["buyer_region_key"].fillna("").astype(str)
    else:
        frame["_region_key"] = [
            normalize_region_key(region_type, region_label)
            for region_type, region_label in zip(frame["_region_type"].tolist(), frame["_region_label"].tolist())
        ]
    if "_risk_score_numeric" not in frame:
        frame["_risk_score_numeric"] = _analytics_numeric(frame, "risk_priority_score").fillna(0.0)
    if "_contract_value_numeric" not in frame:
        frame["_contract_value_numeric"] = _analytics_numeric(frame, "tender_value")
    if "_is_high" not in frame:
        frame["_is_high"] = frame.get("predicted_label", pd.Series("", index=frame.index)).astype(str).str.contains("Tinggi", na=False)
    frame["_contract_value_numeric"] = frame["_contract_value_numeric"].fillna(0.0).clip(lower=0)

    grouped = (
        frame.groupby(["_region_key", "_region_label", "_region_type"], sort=False, observed=True)
        .agg(
            count=("_region_label", "size"),
            high_risk_count=("_is_high", "sum"),
            total_contract_value=("_contract_value_numeric", "sum"),
            average_risk_score=("_risk_score_numeric", "mean"),
            region_source=("buyer_region_source", "first"),
            region_note=("buyer_region_note", "first"),
        )
        .reset_index()
    )
    grouped["percent"] = (grouped["count"] / matched_count * 100).round(2) if matched_count else 0.0
    grouped["high_risk_percent"] = (grouped["high_risk_count"] / grouped["count"] * 100).fillna(0).round(2)
    grouped["total_contract_value"] = grouped["total_contract_value"].round(2)
    grouped["average_risk_score"] = grouped["average_risk_score"].fillna(0).round(6)
    grouped = grouped.sort_values(
        ["high_risk_count", "average_risk_score", "count", "_region_label"],
        ascending=[False, False, False, True],
        kind="mergesort",
    )

    items: list[dict[str, Any]] = []
    for row in grouped.to_dict(orient="records"):
        region_type = str(row["_region_type"] or "unknown")
        region_key = str(row["_region_key"] or "")
        if region_type not in {"kabupaten", "kota"}:
            status = "unsupported_level"
            map_key: str | None = None
            province: str | None = None
        elif region_key in registry:
            status = "matched"
            map_key = region_key
            province = registry[region_key].get("province") or None
        else:
            status = "unmatched"
            map_key = None
            province = None

        item = {
            "region_key": region_key,
            "map_key": map_key,
            "label": str(row["_region_label"]),
            "province": province,
            "region_type": region_type,
            "status": status,
            "geo_match_status": status,
            "count": int(row["count"]),
            "percent": float(row["percent"]),
            "high_risk_count": int(row["high_risk_count"]),
            "high_risk_percent": float(row["high_risk_percent"]),
            "total_contract_value": float(row["total_contract_value"]),
            "average_risk_score": float(row["average_risk_score"]),
            "region_source": str(row.get("region_source") or "") or None,
            "region_note": str(row.get("region_note") or "") or None,
            "filter_value": region_key,
        }
        items.append(item)

    meta["regions_returned"] = len(items)
    meta["matched_regions"] = sum(1 for item in items if item["status"] == "matched")
    meta["mapped_regions"] = meta["matched_regions"]
    meta["unmatched_regions"] = sum(1 for item in items if item["status"] == "unmatched")
    meta["unsupported_regions"] = sum(1 for item in items if item["status"] == "unsupported_level")
    meta["unsupported_level_regions"] = meta["unsupported_regions"]
    return items, meta


def _archive_coverage_proof(
    queue: pd.DataFrame,
    metadata: ArchiveInferenceMetadata,
) -> dict[str, Any]:
    split_counts = _split_distribution(queue)
    return {
        "archive_scope": metadata.archive_scope,
        "total_rows": int(metadata.rows_scored),
        "matched_count": int(len(queue)),
        "train_rows": int(metadata.train_rows),
        "heldout_rows": int(metadata.heldout_rows),
        "filtered_train_rows": split_counts["train_data"],
        "filtered_heldout_rows": split_counts["test_data"],
        "source_splits": list(metadata.source_splits),
        "feature_sources": list(metadata.feature_sources),
        "raw_sources": list(metadata.raw_sources),
        "eval_claim_note": (
            "Held-out evaluation claims remain scoped to test_data; train_data rows are shown "
            "for archive browsing and triase risiko only."
        ),
        "archive_display_note": metadata.display_note,
        "no_cloud_call": True,
        "no_live_scraping": True,
        "no_retraining": True,
    }


def _archive_donut(queue: pd.DataFrame) -> list[dict[str, Any]]:
    summary = _summary(queue)
    total = summary["total"]
    rows: list[dict[str, Any]] = []
    for label, key in (
        ("Risiko Tinggi", "risiko_tinggi"),
        ("Risiko Sedang", "risiko_sedang"),
        ("Risiko Rendah", "risiko_rendah"),
    ):
        count = int(summary[key])
        rows.append(
            {
                "label": label,
                "filter_value": label,
                "count": count,
                "percent": round((count / total) * 100, 2) if total else 0.0,
                "color": _analytics_risk_color(label),
            }
        )
    return rows


def _build_archive_analytics_response(
    *,
    risk: str,
    split: str,
    search: str,
    buyer: str,
    supplier: str,
    region_key: str,
    sort: str,
) -> ArchiveAnalyticsResponse:
    _, archive_queue, metadata = _archive_runtime_or_http_error()
    normalized_region_key = _normalize_region_filter_key(region_key)
    filtered = _filter_archive_rows(
        archive_queue,
        risk=risk,
        split=split,
        search=search,
        buyer=buyer,
        supplier=supplier,
        region_key=normalized_region_key,
        sort=sort,
    )
    priority_map, priority_map_meta = _archive_priority_map(filtered)
    regional_concentration, regional_meta = _archive_concentration(
        filtered,
        group_column="buyer_region",
        sort=sort,
        regional=True,
    )
    buyer_concentration, buyer_meta = _archive_concentration(
        filtered,
        group_column="buyer",
        sort=sort,
        regional=False,
    )
    region_map, region_map_meta = _archive_region_map(filtered)
    matched_count = int(len(filtered))
    return ArchiveAnalyticsResponse(
        filters={
            "risk": risk,
            "split": split,
            "search": search,
            "buyer": buyer,
            "supplier": supplier,
            "sort": sort,
            "region_key": normalized_region_key,
        },
        counts={
            "total_rows": int(metadata.rows_scored),
            "matched_count": matched_count,
            "train_rows": int(metadata.train_rows),
            "heldout_rows": int(metadata.heldout_rows),
            "risk_distribution": _label_distribution(filtered),
            "split_distribution": _split_distribution(filtered),
        },
        priority_map=priority_map,
        priority_map_meta=priority_map_meta,
        regional_concentration=regional_concentration,
        regional_meta=regional_meta,
        region_map=region_map,
        region_map_meta=region_map_meta,
        buyer_concentration=buyer_concentration,
        buyer_meta=buyer_meta,
        coverage_proof=_archive_coverage_proof(filtered, metadata),
        monthly_trends=_monthly_risk_trend(filtered),
        donut=_archive_donut(filtered),
        display_note=(
            "Archive analytics are bounded summaries over filtered local prepared data; "
            "charts support triase risiko and prioritas review, bukan tuduhan pelanggaran."
        ),
        guardrail=SAFE_GUARDRAIL_ID,
    )


def _filter_queue(
    queue: pd.DataFrame,
    *,
    risk: str,
    search: str,
    buyer: str,
    supplier: str,
    top_n: int,
) -> tuple[pd.DataFrame, int]:
    filtered = _filter_ranked_rows(queue, risk=risk, search=search, buyer=buyer, supplier=supplier)
    matched_count = int(len(filtered))
    return filtered.head(top_n), matched_count


def _dataset_columns(queue: pd.DataFrame) -> list[str]:
    preferred = [
        "risk_rank",
        "case_id",
        "row_id",
        "ocid",
        "tender_id",
        "package_title",
        "buyer",
        "supplier",
        "tender_value_display",
        "procurement_method",
        "category",
        "status",
        "date_published",
        "predicted_label",
        "probability",
        "risk_priority_score",
    ]
    return [column for column in preferred if column in queue.columns]


def _page_rows(queue: pd.DataFrame, *, page: int, page_size: int) -> tuple[pd.DataFrame, int, int]:
    total_pages = max(1, int(np.ceil(len(queue) / page_size))) if len(queue) else 1
    effective_page = min(page, total_pages)
    start = (effective_page - 1) * page_size
    end = start + page_size
    return queue.iloc[start:end], total_pages, effective_page


def _demo_case_id(queue: pd.DataFrame) -> str | None:
    if queue.empty:
        return None
    top = queue.sort_values("risk_rank", ascending=True).iloc[0]
    return str(top["case_id"])


def _casebook_payload(case_id: str) -> dict[str, Any]:
    dataset, backend, predictions, _, metadata = _runtime_or_http_error()
    _ = metadata
    return build_casebook(case_id, dataset, predictions, backend)


@lru_cache(maxsize=1)
def _review_store() -> ReviewStore:
    return ReviewStore(REVIEW_DB_PATH)


def _review_prefill_from_casebook(payload: dict[str, Any]) -> dict[str, Any]:
    brief = payload.get("explanation_brief", {}) or {}
    checklist = brief.get("reviewer_checklist") or []
    if not checklist:
        checklist = [item.get("reviewer_check") for item in brief.get("top_drivers", []) if item.get("reviewer_check")]
    return {
        "rationale": brief.get("summary", ""),
        "model_interpretation": brief.get("model_interpretation", ""),
        "checklist": checklist,
        "top_drivers": brief.get("top_drivers", []),
        "safety_note": brief.get("safety_note", SAFE_GUARDRAIL_ID),
    }


def _review_snapshots(casebook_payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return (
        dict(casebook_payload.get("metadata", {}) or {}),
        dict(casebook_payload.get("model_output", {}) or {}),
        _review_prefill_from_casebook(casebook_payload),
    )


def _draft_review(case_id: str, casebook_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = casebook_payload or _casebook_payload(case_id)
    package_snapshot, model_snapshot, prefill = _review_snapshots(payload)
    return {
        "case_id": str(payload.get("case_id", case_id)),
        "status": DEFAULT_REVIEW_STATUS,
        "reviewer_name": "",
        "notes": "",
        "decision_summary": "",
        "package_snapshot": package_snapshot,
        "model_snapshot": model_snapshot,
        "prefill": prefill,
        "created_at": None,
        "updated_at": None,
        "signed_off_at": None,
        "is_saved": False,
        "event_count": 0,
        "history": [],
        "guardrail": SAFE_GUARDRAIL_ID,
    }


def _review_record(payload: dict[str, Any]) -> ReviewRecord:
    return ReviewRecord(**{**payload, "guardrail": SAFE_GUARDRAIL_ID})


def _review_list_item_from_queue(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": str(row.get("case_id", "")),
        "status": DEFAULT_REVIEW_STATUS,
        "reviewer_name": "",
        "notes": "",
        "decision_summary": "",
        "package_snapshot": {
            "package_title": row.get("package_title", ""),
            "buyer": row.get("buyer", ""),
            "supplier": row.get("supplier", ""),
            "tender_value_display": row.get("tender_value_display", ""),
            "procurement_method": row.get("procurement_method", ""),
        },
        "model_snapshot": {
            "predicted_label": row.get("predicted_label", ""),
            "probability": row.get("probability"),
            "risk_priority_score": row.get("risk_priority_score"),
            "risk_rank": row.get("risk_rank"),
        },
        "prefill": {"rationale": "", "checklist": [], "top_drivers": []},
        "created_at": None,
        "updated_at": None,
        "signed_off_at": None,
        "is_saved": False,
        "event_count": 0,
        "history": [],
        "guardrail": SAFE_GUARDRAIL_ID,
    }


def _review_counts(items: list[ReviewRecord]) -> dict[str, int]:
    counts = {status: 0 for status in REVIEW_STATUSES}
    for item in items:
        counts[item.status] = counts.get(item.status, 0) + 1
    return counts


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    model_artifact: str | None = None
    try:
        _, backend, _, _, _ = _load_runtime()
        model_artifact = Path(backend.model_artifact).name
    except DemoRuntimeError:
        model_artifact = None
    return HealthResponse(model_artifact=model_artifact, guardrail=SAFE_GUARDRAIL_ID)


@app.get("/api/demo-state", response_model=DemoStateResponse)
def demo_state() -> DemoStateResponse:
    try:
        dataset, backend, _, queue, metadata = _load_runtime()
    except DemoRuntimeError as exc:
        return DemoStateResponse(
            ready=False,
            guardrail=SAFE_GUARDRAIL_ID,
            production_build_status=_build_status(),
            golden_path_steps=GOLDEN_PATH_STEPS,
            error=str(exc),
        )
    case_id = _demo_case_id(queue)
    return DemoStateResponse(
        ready=True,
        demo_case_id=case_id,
        casebook_url=f"/api/casebook/{case_id}" if case_id else None,
        export_html_url=f"/api/casebook/{case_id}/export.html" if case_id else None,
        model_artifact=Path(backend.model_artifact).name,
        feature_source=str(dataset.feature_path.relative_to(PROJECT_ROOT)),
        raw_source=str(dataset.raw_path.relative_to(PROJECT_ROOT)),
        inference_status=_inference_status(
            metadata,
            displayed_rows=min(DEFAULT_QUEUE_TOP_N, len(queue)),
            matched_rows=len(queue),
            queue_limit=DEFAULT_QUEUE_TOP_N,
        ),
        guardrail=SAFE_GUARDRAIL_ID,
        golden_path_steps=GOLDEN_PATH_STEPS,
        production_build_status=_build_status(),
    )


@app.get("/api/inference-status", response_model=InferenceStatus)
def inference_status() -> InferenceStatus:
    _, _, _, queue, metadata = _runtime_or_http_error()
    return _inference_status(
        metadata,
        displayed_rows=min(DEFAULT_QUEUE_TOP_N, len(queue)),
        matched_rows=len(queue),
        queue_limit=DEFAULT_QUEUE_TOP_N,
    )


@app.get("/api/queue", response_model=QueueResponse)
def queue_endpoint(
    demo: bool = False,
    top_n: int = Query(default=DEFAULT_QUEUE_TOP_N, ge=1, le=MAX_QUEUE_TOP_N),
    risk: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
) -> QueueResponse:
    _, _, _, queue, metadata = _runtime_or_http_error()
    if demo:
        queue = queue.sort_values("risk_rank", ascending=True)
    filtered, matched_count = _filter_queue(queue, risk=risk, search=search, buyer=buyer, supplier=supplier, top_n=top_n)
    return QueueResponse(
        summary=_summary(filtered),
        distribution=_distribution(filtered),
        trend=_trend(filtered),
        items=_records(filtered),
        matched_count=matched_count,
        inference_status=_inference_status(
            metadata,
            displayed_rows=len(filtered),
            matched_rows=matched_count,
            queue_limit=top_n,
        ),
        guardrail=SAFE_GUARDRAIL_ID,
        demo_case_id=_demo_case_id(filtered),
    )


@app.get("/api/dataset", response_model=DatasetBrowserResponse)
def dataset_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_DATASET_PAGE_SIZE, ge=1, le=MAX_DATASET_PAGE_SIZE),
    risk: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
) -> DatasetBrowserResponse:
    """Return a paginated browser view of the full local AI-scored dataset."""
    _, _, _, queue, metadata = _runtime_or_http_error()
    filtered = _filter_ranked_rows(queue, risk=risk, search=search, buyer=buyer, supplier=supplier)
    page_items, total_pages, effective_page = _page_rows(filtered, page=page, page_size=page_size)
    columns = _dataset_columns(page_items if not page_items.empty else queue)
    if columns:
        page_items = page_items.loc[:, columns]
    matched_count = int(len(filtered))
    return DatasetBrowserResponse(
        total_rows=int(metadata.rows_scored),
        matched_count=matched_count,
        page=effective_page,
        page_size=page_size,
        total_pages=total_pages,
        columns=columns,
        items=_records(page_items),
        inference_status=_inference_status(
            metadata,
            displayed_rows=len(page_items),
            matched_rows=matched_count,
            queue_limit=page_size,
        ),
        display_note=(
            "Dataset browser menampilkan halaman kecil dari seluruh split yang sudah discore "
            "model lokal; browser tidak menerima arsip penuh sekaligus."
        ),
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/archive", response_model=ArchiveBrowserResponse)
def archive_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_ARCHIVE_PAGE_SIZE, ge=1, le=MAX_DATASET_PAGE_SIZE),
    risk: str = "all",
    split: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
    region_key: str = "",
    sort: str = Query(default="risk_desc", pattern="^(risk_desc|date_desc|value_desc)$"),
) -> ArchiveBrowserResponse:
    """Return a paginated, split-labeled browser over train_data + test_data."""
    _, archive_queue, metadata = _archive_runtime_or_http_error()
    filtered = _filter_archive_rows(
        archive_queue,
        risk=risk,
        split=split,
        search=search,
        buyer=buyer,
        supplier=supplier,
        region_key=region_key,
        sort=sort,
    )
    monthly_risk_trend = _monthly_risk_trend(filtered)
    date_range = _archive_date_range(filtered)
    page_items, total_pages, effective_page = _page_rows(filtered, page=page, page_size=page_size)
    page_items = _hydrate_tender_value_display(page_items)
    columns = _archive_columns(page_items if not page_items.empty else archive_queue)
    if columns:
        page_items = page_items.loc[:, columns]
    matched_count = int(len(filtered))
    return ArchiveBrowserResponse(
        total_rows=int(metadata.rows_scored),
        matched_count=matched_count,
        page=effective_page,
        page_size=page_size,
        total_pages=total_pages,
        archive_scope=metadata.archive_scope,
        heldout_rows=int(metadata.heldout_rows),
        train_rows=int(metadata.train_rows),
        risk_distribution=_label_distribution(filtered),
        split_distribution=_split_distribution(filtered),
        monthly_risk_trend=monthly_risk_trend,
        date_range=date_range,
        columns=columns,
        items=_records(page_items),
        inference_status=_archive_status(
            metadata,
            displayed_rows=len(page_items),
            matched_rows=matched_count,
            queue_limit=page_size,
        ),
        display_note=metadata.display_note,
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/archive/analytics", response_model=ArchiveAnalyticsResponse)
def archive_analytics_endpoint(
    risk: str = "all",
    split: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
    region_key: str = "",
    sort: str = Query(default="risk_desc", pattern="^(risk_desc|date_desc|value_desc)$"),
) -> ArchiveAnalyticsResponse:
    """Return bounded analytics over the filtered archive without dumping all rows."""
    return _archive_analytics_response_cached(
        risk=risk,
        split=split,
        search=search,
        buyer=buyer,
        supplier=supplier,
        region_key=region_key,
        sort=sort,
    )



@app.get("/api/reviews", response_model=ReviewListResponse)
def list_reviews(
    status: str = "all",
    search: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_REVIEW_PAGE_SIZE, ge=1, le=MAX_DATASET_PAGE_SIZE),
    top_n: int = Query(default=MAX_QUEUE_TOP_N, ge=1, le=MAX_QUEUE_TOP_N),
) -> ReviewListResponse:
    _, _, _, queue, _ = _runtime_or_http_error()
    saved_by_case = {review["case_id"]: review for review in _review_store().list_reviews()}
    filtered_queue, _ = _filter_queue(queue, risk="all", search=search, buyer="", supplier="", top_n=top_n)
    items_by_case: dict[str, ReviewRecord] = {}
    for row in _records(filtered_queue):
        case_id = str(row.get("case_id", ""))
        review_payload = saved_by_case.pop(case_id, None) or _review_list_item_from_queue(row)
        items_by_case[case_id] = _review_record(review_payload)
    for case_id, review_payload in saved_by_case.items():
        haystack = " ".join(
            str(review_payload.get("package_snapshot", {}).get(key, ""))
            for key in ("package_title", "buyer", "supplier")
        )
        if search and search.casefold() not in f"{case_id} {haystack}".casefold():
            continue
        items_by_case[case_id] = _review_record(review_payload)
    items = list(items_by_case.values())
    if status != "all":
        if status not in REVIEW_STATUSES:
            raise HTTPException(status_code=422, detail=f"Unknown review status: {status}")
        items = [item for item in items if item.status == status]
    total_items = len(items)
    total_pages = max(1, int(np.ceil(total_items / page_size))) if total_items else 1
    effective_page = min(page, total_pages)
    start = (effective_page - 1) * page_size
    page_items = items[start:start + page_size]
    return ReviewListResponse(
        statuses=REVIEW_STATUSES,
        counts=_review_counts(items),
        items=page_items,
        page=effective_page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        top_n=top_n,
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/reviews/{case_id:path}", response_model=ReviewRecord)
def get_review(case_id: str) -> ReviewRecord:
    saved = _review_store().get_review(case_id)
    if saved:
        return _review_record(saved)
    try:
        return _review_record(_draft_review(case_id))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail={"error": _safe_error(exc), "guardrail": SAFE_GUARDRAIL_ID}) from exc


@app.put("/api/reviews/{case_id:path}", response_model=ReviewRecord)
def upsert_review(case_id: str, request: ReviewUpdateRequest) -> ReviewRecord:
    if request.status not in REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown review status: {request.status}")
    try:
        casebook_payload = _casebook_payload(case_id)
        package_snapshot, model_snapshot, prefill = _review_snapshots(casebook_payload)
        saved = _review_store().upsert_review(
            case_id=str(casebook_payload.get("case_id", case_id)),
            status=request.status,
            reviewer_name=request.reviewer_name.strip(),
            notes=request.notes.strip(),
            decision_summary=request.decision_summary.strip(),
            signed_off=request.signed_off or request.status == "Selesai",
            package_snapshot=package_snapshot,
            model_snapshot=model_snapshot,
            prefill=prefill,
        )
        return _review_record(saved)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"error": _safe_error(exc), "guardrail": SAFE_GUARDRAIL_ID}) from exc

@app.get("/api/casebook/{case_id:path}/export.html", response_class=HTMLResponse)
def export_casebook(case_id: str) -> HTMLResponse:
    try:
        payload = _casebook_payload(case_id)
        safe_name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(payload["case_id"]))[:120]
        with TemporaryDirectory(prefix="lpse-x-export-") as tmpdir:
            output = Path(tmpdir) / f"casebook-{safe_name}.html"
            rendered = render_static_casebook_html(payload, output)
            html = rendered.read_text(encoding="utf-8")
        provenance = payload["provenance"]
        disclosure = (
            "<section class='section'>"
            "<h2>Selected Export Contract</h2>"
            f"<p>Requested case id: {escape(str(case_id))}; exported case id: {escape(str(payload['case_id']))}.</p>"
            f"<p>Model artifact: {escape(str(provenance['model_artifact']))}</p>"
            f"<p>Feature source: {escape(str(provenance['feature_source']))}</p>"
            f"<p>Raw source: {escape(str(provenance['raw_source']))}</p>"
            "</section>"
        )
        html = html.replace('<main class="report">', f'<main class="report">{disclosure}', 1)
        return HTMLResponse(content=html, media_type="text/html")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"error": _safe_error(exc), "guardrail": SAFE_GUARDRAIL_ID}) from exc


@app.get("/api/casebook/{case_id:path}")
def casebook(case_id: str) -> dict[str, Any]:
    try:
        return _casebook_payload(case_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"error": _safe_error(exc), "guardrail": SAFE_GUARDRAIL_ID}) from exc


@app.get("/api/static-casebook", response_model=StaticCasebookResponse)
def static_casebook_status() -> StaticCasebookResponse:
    return StaticCasebookResponse(
        available=DEFAULT_STATIC_CASEBOOK_PATH.is_file(),
        path=str(DEFAULT_STATIC_CASEBOOK_PATH.relative_to(PROJECT_ROOT)),
        primary_export=False,
        primary_export_route="/api/casebook/{case_id}/export.html",
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/assets/{asset_path:path}")
def frontend_asset(asset_path: str) -> FileResponse:
    asset = _frontend_asset(asset_path)
    if asset.is_file():
        return FileResponse(asset)
    raise HTTPException(status_code=404, detail="Frontend asset not found")


def _spa_response() -> FileResponse | JSONResponse:
    index = _frontend_index()
    if index.is_file():
        return FileResponse(index, media_type="text/html")
    return JSONResponse(
        status_code=404,
        content={
            "error": "frontend_dist_missing",
            "message": "Run `cd frontend && npm run build` to serve the React command center.",
            "api_ready": "/api/demo-state",
        },
    )


@app.get("/", response_model=None)
def root():
    return _spa_response()


@app.get("/{full_path:path}", response_model=None)
def spa_fallback(full_path: str, request: Request):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    return _spa_response()
