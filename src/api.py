"""FastAPI runtime for the LPSE-X product command center.

This service wraps the offline ML primitives shipped in the sibling `lpseN`
ML repo (`src.product_demo`, `src.casebook`, `src.artifacts`, ...) with a
bounded, judge-safe HTTP surface.

Hard rules:

* No training, scraping, cloud calls, or artifact writes.
* `test_data/` is the held-out evaluation surface.
* `train_data/` only appears in archive browsing with explicit split labels.
* Every user-facing response carries the LPSE-X guardrail copy.
* No endpoint returns the full 93k held-out or 465k archive rows in one shot.
"""

from __future__ import annotations

import math
import os
import re
import threading
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api_schemas import (
    ArchiveAnalyticsCounts,
    ArchiveAnalyticsFilters,
    ArchiveAnalyticsResponse,
    ArchiveBrowserResponse,
    ArchiveConcentrationItem,
    ArchiveConcentrationMeta,
    ArchiveCoverageProof,
    ArchiveDateRange,
    ArchiveDonutSegment,
    ArchiveInferenceStatus,
    ArchivePriorityMapMeta,
    ArchivePriorityPoint,
    DatasetBrowserResponse,
    DemoStateResponse,
    DistributionItem,
    GoldenPathStep,
    HealthResponse,
    InferenceStatus,
    MonthlyRiskTrendItem,
    ProductionBuildStatus,
    QueueResponse,
    ReviewListResponse,
    ReviewRecord,
    ReviewUpdateRequest,
    StaticCasebookResponse,
    SummaryCounts,
    TrendBucket,
)
from src.casebook import (
    DEFAULT_STATIC_CASEBOOK_PATH,
    build_casebook,
    render_static_casebook_html,
)
from src.product_demo import (
    SAFE_GUARDRAIL_ID,
    ArchiveInferenceMetadata,
    DemoDataset,
    InferenceRunMetadata,
    PredictionBackend,
    build_archive_inference_run,
    build_inference_run,
    format_currency,
)
from src.reviews import (
    DEFAULT_REVIEW_STATUS,
    REVIEW_STATUSES,
    ReviewStore,
    utc_now_iso,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

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
DEFAULT_REVIEW_TOP_N = 50
MAX_REVIEW_TOP_N = 500

DEFAULT_DATASET_DISPLAY_NOTE = (
    "Browser hanya menerima halaman terbatas; seluruh 93.034 baris held-out "
    "tetap di server demi guardrail offline-local."
)
ARCHIVE_BROWSER_DISPLAY_NOTE = (
    "Arsip 465.184 baris dibatasi per halaman. Baris train_data hanya untuk "
    "browsing arsip; bukti held-out tetap dari test_data."
)
ARCHIVE_ANALYTICS_DISPLAY_NOTE = (
    "Analytics arsip dibatasi: maksimal 500 titik peta, 12 entri konsentrasi, "
    "dan agregat bulanan. Tidak ada baris arsip mentah dikirim ke browser."
)
HEALTH_GUARDRAIL_NOTE = (
    "Service offline-local; tidak melakukan scraping, panggilan cloud, atau "
    "retraining model."
)


# ---------------------------------------------------------------------------
# Errors / app setup
# ---------------------------------------------------------------------------


class DemoRuntimeError(RuntimeError):
    """Controlled error raised when cached runtime cannot be produced."""


def _safe_error(exc: BaseException) -> str:
    """Short, API-safe error string. Never expose tracebacks."""
    text = str(exc).strip() or exc.__class__.__name__
    if len(text) > 240:
        text = text[:237] + "..."
    return text


def _build_status() -> ProductionBuildStatus:
    index_html = FRONTEND_DIST / "index.html"
    return ProductionBuildStatus(
        dist_present=index_html.exists(),
        served_by_fastapi=index_html.exists(),
        index_html=str(index_html.relative_to(PROJECT_ROOT)) if index_html.exists() else "",
    )


# ---------------------------------------------------------------------------
# Cached runtimes
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _load_runtime() -> Tuple[DemoDataset, PredictionBackend, pd.DataFrame, pd.DataFrame, InferenceRunMetadata]:
    """Score the held-out split once and cache the result for the process.

    `build_inference_run` is offline-local. The cache key is intentionally
    constant so every endpoint observes the same `generated_at`, queue rows,
    and latency metadata.
    """
    try:
        return build_inference_run(max_rows=None, top_n=None)
    except Exception as exc:  # pragma: no cover - exercised by error paths
        raise DemoRuntimeError(_safe_error(exc)) from exc


_archive_lock = threading.Lock()
_archive_runtime_cache: Dict[str, Any] = {}


def _load_archive_runtime() -> Tuple[PredictionBackend, pd.DataFrame, ArchiveInferenceMetadata]:
    """Score `train_data + test_data` once and cache the prepared queue.

    Archive runtime is heavier than held-out, so we serialize concurrent
    callers via `_archive_lock` and stash the prepared queue in process
    memory. The held-out cache remains untouched, preserving its judge-safe
    proof contract.
    """
    cached = _archive_runtime_cache.get("payload")
    if cached is not None:
        return cached

    with _archive_lock:
        cached = _archive_runtime_cache.get("payload")
        if cached is not None:
            return cached
        try:
            backend, archive_queue, metadata = build_archive_inference_run()
        except Exception as exc:  # pragma: no cover - error path
            raise DemoRuntimeError(_safe_error(exc)) from exc
        prepared = _prepare_archive_runtime_queue(archive_queue)
        payload = (backend, prepared, metadata)
        _archive_runtime_cache["payload"] = payload
        return payload


_archive_analytics_cache: Dict[Tuple[str, ...], ArchiveAnalyticsResponse] = {}
_archive_analytics_lock = threading.Lock()


def _prepare_archive_runtime_queue(archive_queue: pd.DataFrame) -> pd.DataFrame:
    """Add helper columns the analytics + browser endpoints rely on."""
    if archive_queue.empty:
        return archive_queue.copy()

    df = archive_queue.copy()

    contract_value = pd.to_numeric(df.get("tender_value"), errors="coerce")
    df["contract_value"] = contract_value
    df["contract_value_display"] = [
        format_currency(value, str(currency) if currency else "IDR")
        for value, currency in zip(contract_value.tolist(), df.get("currency", pd.Series("", index=df.index)).tolist())
    ]

    if "date_published" in df.columns:
        df["date_published_dt"] = pd.to_datetime(df["date_published"], errors="coerce", utc=True)
    else:
        df["date_published_dt"] = pd.NaT

    df["risk_priority_score"] = pd.to_numeric(df.get("risk_priority_score"), errors="coerce").fillna(0.0)
    df["is_high_risk"] = df.get("predicted_label", pd.Series("", index=df.index)).eq("Risiko Tinggi")

    return df


# ---------------------------------------------------------------------------
# JSON-safe helpers
# ---------------------------------------------------------------------------


def _records(df: pd.DataFrame, columns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Convert a DataFrame slice to a list of JSON-safe dicts."""
    if df is None or df.empty:
        return []
    if columns is not None:
        df = df.loc[:, [col for col in columns if col in df.columns]]
    df = df.copy()

    for column in df.columns:
        series = df[column]
        if pd.api.types.is_datetime64_any_dtype(series):
            df[column] = series.dt.strftime("%Y-%m-%d").where(series.notna(), None)
        elif pd.api.types.is_float_dtype(series):
            df[column] = series.where(series.notna(), None)

    records = df.to_dict(orient="records")
    safe: List[Dict[str, Any]] = []
    for row in records:
        clean: Dict[str, Any] = {}
        for key, value in row.items():
            clean[key] = _json_safe(value)
        safe.append(clean)
    return safe


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, (np.floating,)):
        as_float = float(value)
        return None if math.isnan(as_float) or math.isinf(as_float) else as_float
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.isoformat()
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) is False and pd.isna(value) if value is not None else False:
        return None
    return value


# ---------------------------------------------------------------------------
# Status builders
# ---------------------------------------------------------------------------


def _inference_status(
    metadata: InferenceRunMetadata,
    *,
    displayed_rows: int,
    matched_rows: Optional[int],
    queue_limit: int,
) -> InferenceStatus:
    return InferenceStatus(
        model_artifact=metadata.model_artifact,
        model_backend=metadata.model_backend,
        inference_mode=metadata.inference_mode,
        feature_source=metadata.feature_source,
        raw_source=metadata.raw_source,
        source_split=metadata.source_split,
        rows_scored=metadata.rows_scored,
        rows_ranked=metadata.rows_ranked,
        rows_displayed=int(displayed_rows),
        matched_rows=int(matched_rows) if matched_rows is not None else None,
        queue_limit=int(queue_limit),
        loaded_rows_cap=metadata.loaded_rows_cap,
        data_load_latency_ms=metadata.data_load_latency_ms,
        model_load_latency_ms=metadata.model_load_latency_ms,
        prediction_latency_ms=metadata.prediction_latency_ms,
        queue_build_latency_ms=metadata.queue_build_latency_ms,
        total_latency_ms=metadata.total_latency_ms,
        generated_at=metadata.generated_at,
        no_cloud_call=metadata.no_cloud_call,
        no_live_scraping=metadata.no_live_scraping,
        no_retraining=metadata.no_retraining,
        display_note=metadata.display_note,
        guardrail=metadata.guardrail,
    )


def _archive_status(
    metadata: ArchiveInferenceMetadata,
    *,
    displayed_rows: int,
    matched_rows: Optional[int],
    queue_limit: int,
) -> ArchiveInferenceStatus:
    return ArchiveInferenceStatus(
        model_artifact=metadata.model_artifact,
        model_backend=metadata.model_backend,
        inference_mode=metadata.inference_mode,
        feature_source=metadata.feature_sources[-1] if metadata.feature_sources else "",
        raw_source=metadata.raw_sources[-1] if metadata.raw_sources else "",
        source_split=",".join(metadata.source_splits),
        rows_scored=metadata.rows_scored,
        rows_ranked=metadata.rows_ranked,
        rows_displayed=int(displayed_rows),
        matched_rows=int(matched_rows) if matched_rows is not None else None,
        queue_limit=int(queue_limit),
        loaded_rows_cap=None,
        data_load_latency_ms=metadata.data_load_latency_ms,
        model_load_latency_ms=metadata.model_load_latency_ms,
        prediction_latency_ms=metadata.prediction_latency_ms,
        queue_build_latency_ms=metadata.queue_build_latency_ms,
        total_latency_ms=metadata.total_latency_ms,
        generated_at=metadata.generated_at,
        no_cloud_call=metadata.no_cloud_call,
        no_live_scraping=metadata.no_live_scraping,
        no_retraining=metadata.no_retraining,
        display_note=metadata.display_note,
        guardrail=metadata.guardrail,
        archive_scope=metadata.archive_scope,
        train_rows=metadata.train_rows,
        heldout_rows=metadata.heldout_rows,
        feature_sources=list(metadata.feature_sources),
        raw_sources=list(metadata.raw_sources),
        source_splits=list(metadata.source_splits),
    )


# ---------------------------------------------------------------------------
# Summary / distribution / trend
# ---------------------------------------------------------------------------


def _summary(queue: pd.DataFrame) -> SummaryCounts:
    if queue is None or queue.empty:
        return SummaryCounts()
    labels = queue.get("predicted_label", pd.Series(dtype=str)).astype(str)
    return SummaryCounts(
        total=int(len(queue)),
        high=int(labels.eq("Risiko Tinggi").sum()),
        medium=int(labels.eq("Risiko Sedang").sum()),
        low=int(labels.eq("Risiko Rendah").sum()),
    )


def _distribution(queue: pd.DataFrame) -> List[DistributionItem]:
    if queue is None or queue.empty:
        return [DistributionItem(label=label, count=0) for label in ("Risiko Tinggi", "Risiko Sedang", "Risiko Rendah")]
    counts = queue.get("predicted_label", pd.Series(dtype=str)).astype(str).value_counts()
    ordered = ["Risiko Tinggi", "Risiko Sedang", "Risiko Rendah"]
    return [DistributionItem(label=label, count=int(counts.get(label, 0))) for label in ordered]


def _trend(queue: pd.DataFrame, *, max_buckets: int = 6) -> List[TrendBucket]:
    if queue is None or queue.empty:
        return []
    bucket_size = max(1, len(queue) // max_buckets)
    rows = []
    for index in range(0, len(queue), bucket_size):
        chunk = queue.iloc[index : index + bucket_size]
        if chunk.empty:
            continue
        rank_lo = int(chunk["risk_rank"].min()) if "risk_rank" in chunk else index + 1
        rank_hi = int(chunk["risk_rank"].max()) if "risk_rank" in chunk else index + len(chunk)
        avg = float(pd.to_numeric(chunk.get("risk_priority_score"), errors="coerce").mean() or 0.0)
        rows.append(
            TrendBucket(
                bucket=f"#{rank_lo}-{rank_hi}",
                average_priority=round(avg, 6),
                review_count=int(len(chunk)),
            )
        )
        if len(rows) >= max_buckets:
            break
    return rows


# ---------------------------------------------------------------------------
# Filtering helpers
# ---------------------------------------------------------------------------


def _normalize_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    text = str(value).strip().casefold()
    return unicodedata.normalize("NFKC", text)


def _filter_ranked_rows(
    queue: pd.DataFrame,
    *,
    risk: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
) -> pd.DataFrame:
    if queue is None or queue.empty:
        return queue.iloc[0:0] if queue is not None else pd.DataFrame()
    df = queue
    if risk and risk != "all":
        df = df[df.get("predicted_label", pd.Series("", index=df.index)).astype(str).eq(risk)]
    search_norm = _normalize_text(search)
    if search_norm:
        cols = [
            "case_id",
            "package_title",
            "buyer",
            "supplier",
            "tender_id",
            "ocid",
            "buyer_region",
        ]
        haystack = pd.Series("", index=df.index, dtype=str)
        for column in cols:
            if column in df.columns:
                haystack = haystack.str.cat(df[column].astype(str).str.casefold(), sep=" ", na_rep="")
        df = df[haystack.str.contains(re.escape(search_norm), na=False, regex=True)]
    buyer_norm = _normalize_text(buyer)
    if buyer_norm and "buyer" in df.columns:
        df = df[df["buyer"].astype(str).str.casefold().str.contains(re.escape(buyer_norm), na=False)]
    supplier_norm = _normalize_text(supplier)
    if supplier_norm and "supplier" in df.columns:
        df = df[df["supplier"].astype(str).str.casefold().str.contains(re.escape(supplier_norm), na=False)]
    return df


def _filter_queue(
    queue: pd.DataFrame,
    *,
    risk: str,
    search: str,
    buyer: str,
    supplier: str,
    top_n: int,
) -> Tuple[pd.DataFrame, int]:
    filtered = _filter_ranked_rows(queue, risk=risk, search=search, buyer=buyer, supplier=supplier)
    matched = int(len(filtered))
    return filtered.head(top_n).copy(), matched


def _filter_archive_rows(
    archive_queue: pd.DataFrame,
    *,
    risk: str = "all",
    split: str = "all",
    search: str = "",
    buyer: str = "",
    supplier: str = "",
    region_key: str = "",
    sort: str = "risk_desc",
) -> pd.DataFrame:
    if archive_queue is None or archive_queue.empty:
        return archive_queue.iloc[0:0] if archive_queue is not None else pd.DataFrame()

    df = _filter_ranked_rows(archive_queue, risk=risk, search=search, buyer=buyer, supplier=supplier)

    if split and split != "all" and "source_split" in df.columns:
        df = df[df["source_split"].astype(str).eq(split)]

    if region_key and "buyer_region_key" in df.columns:
        normalized = region_key.strip().casefold()
        df = df[df["buyer_region_key"].astype(str).str.casefold().eq(normalized)]

    if sort == "date_desc" and "date_published_dt" in df.columns:
        df = df.sort_values(["date_published_dt", "risk_priority_score"], ascending=[False, False], kind="mergesort")
    elif sort == "value_desc" and "contract_value" in df.columns:
        df = df.sort_values(["contract_value", "risk_priority_score"], ascending=[False, False], kind="mergesort")
    else:
        df = df.sort_values(["risk_priority_score", "probability"], ascending=[False, False], kind="mergesort")

    return df


def _page_rows(
    df: pd.DataFrame,
    *,
    page: int,
    page_size: int,
) -> Tuple[pd.DataFrame, int, int]:
    total = int(len(df))
    if total == 0:
        return df.iloc[0:0].copy(), 1, 0
    total_pages = max(1, math.ceil(total / page_size))
    effective_page = max(1, min(page, total_pages))
    start = (effective_page - 1) * page_size
    end = start + page_size
    return df.iloc[start:end].copy(), effective_page, total_pages


def _dataset_columns(df: pd.DataFrame) -> List[str]:
    preferred = [
        "risk_rank",
        "case_id",
        "package_title",
        "buyer",
        "buyer_region",
        "supplier",
        "tender_value_display",
        "procurement_method",
        "predicted_label",
        "probability",
        "risk_priority_score",
        "review_status",
        "date_published",
    ]
    return [column for column in preferred if column in df.columns]


def _archive_columns(df: pd.DataFrame) -> List[str]:
    preferred = [
        "archive_rank",
        "split_risk_rank",
        "source_split",
        "is_heldout",
        "eval_claim_scope",
        "case_id",
        "archive_id",
        "package_title",
        "buyer",
        "buyer_region",
        "supplier",
        "contract_value_display",
        "tender_value_display",
        "predicted_label",
        "probability",
        "risk_priority_score",
        "date_published",
    ]
    return [column for column in preferred if column in df.columns]


# ---------------------------------------------------------------------------
# Archive analytics
# ---------------------------------------------------------------------------


def _analytics_risk_color(label: str) -> str:
    if "Tinggi" in label:
        return "#EF4444"
    if "Sedang" in label:
        return "#F59E0B"
    return "#10B981"


def _analytics_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value)


def _analytics_numeric(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def _archive_priority_map(df: pd.DataFrame) -> Tuple[List[ArchivePriorityPoint], ArchivePriorityMapMeta]:
    if df.empty:
        meta = ArchivePriorityMapMeta(
            point_limit=ARCHIVE_ANALYTICS_POINT_LIMIT,
            sample_strategy="balanced_per_risk_plus_top_value",
            is_capped=False,
            matched_rows=0,
            returned_points=0,
        )
        return [], meta

    matched_rows = int(len(df))
    sampled_frames: List[pd.DataFrame] = []
    risk_order = ["Risiko Tinggi", "Risiko Sedang", "Risiko Rendah"]
    for label in risk_order:
        chunk = df[df["predicted_label"].astype(str).eq(label)]
        if chunk.empty:
            continue
        sampled_frames.append(chunk.head(ARCHIVE_ANALYTICS_PER_TIER_POINTS))

    if "contract_value" in df.columns:
        top_value = df.sort_values("contract_value", ascending=False).head(ARCHIVE_ANALYTICS_TOP_VALUE_POINTS)
        sampled_frames.append(top_value)

    if not sampled_frames:
        sampled = df.head(ARCHIVE_ANALYTICS_POINT_LIMIT)
    else:
        sampled = pd.concat(sampled_frames).drop_duplicates(subset=["archive_id"]).head(ARCHIVE_ANALYTICS_POINT_LIMIT)

    points: List[ArchivePriorityPoint] = []
    for _, row in sampled.iterrows():
        label = _analytics_text(row.get("predicted_label"))
        points.append(
            ArchivePriorityPoint(
                archive_id=_analytics_text(row.get("archive_id")) or _analytics_text(row.get("case_id")),
                case_id=_analytics_text(row.get("case_id")),
                risk_label=label,
                risk_color=_analytics_risk_color(label),
                risk_priority_score=float(row.get("risk_priority_score") or 0.0),
                contract_value=_analytics_numeric(row.get("contract_value")),
                contract_value_display=_analytics_text(row.get("contract_value_display")) or None,
                buyer=_analytics_text(row.get("buyer")) or None,
                buyer_region=_analytics_text(row.get("buyer_region")) or None,
                buyer_region_key=_analytics_text(row.get("buyer_region_key")) or None,
                source_split=_analytics_text(row.get("source_split")),
                is_heldout=bool(row.get("is_heldout", False)),
                eval_claim_scope=_analytics_text(row.get("eval_claim_scope")),
                date_published=_analytics_text(row.get("date_published")) or None,
            )
        )

    meta = ArchivePriorityMapMeta(
        point_limit=ARCHIVE_ANALYTICS_POINT_LIMIT,
        sample_strategy="balanced_per_risk_plus_top_value",
        is_capped=matched_rows > len(points),
        matched_rows=matched_rows,
        returned_points=len(points),
    )
    return points, meta


def _archive_concentration(
    df: pd.DataFrame,
    *,
    label_column: str,
    key_column: str,
    matched_rows: int,
) -> Tuple[List[ArchiveConcentrationItem], ArchiveConcentrationMeta]:
    if df.empty or label_column not in df.columns:
        meta = ArchiveConcentrationMeta(
            limit=ARCHIVE_CONCENTRATION_LIMIT,
            matched_groups=0,
            returned_groups=0,
            is_capped=False,
        )
        return [], meta

    group_columns = [label_column] if label_column == key_column else [label_column, key_column]
    grouped = (
        df.groupby(group_columns, dropna=False)
        .agg(
            count=("risk_priority_score", "size"),
            risk_priority_score=("risk_priority_score", "mean"),
            high_risk_rows=("is_high_risk", "sum"),
        )
        .reset_index()
        .sort_values(["count", "risk_priority_score"], ascending=[False, False])
    )

    matched_groups = int(len(grouped))
    top = grouped.head(ARCHIVE_CONCENTRATION_LIMIT)
    items = [
        ArchiveConcentrationItem(
            label=_analytics_text(row[label_column]) or "Tidak diketahui",
            key=_analytics_text(row[key_column] if key_column in top.columns else row[label_column]),
            count=int(row["count"]),
            risk_priority_score=round(float(row["risk_priority_score"] or 0.0), 6),
            high_risk_rows=int(row["high_risk_rows"]),
            share=round(float(row["count"]) / matched_rows, 6) if matched_rows > 0 else 0.0,
        )
        for _, row in top.iterrows()
    ]
    meta = ArchiveConcentrationMeta(
        limit=ARCHIVE_CONCENTRATION_LIMIT,
        matched_groups=matched_groups,
        returned_groups=len(items),
        is_capped=matched_groups > len(items),
    )
    return items, meta


def _archive_donut(df: pd.DataFrame) -> List[ArchiveDonutSegment]:
    if df.empty:
        return [
            ArchiveDonutSegment(label=label, count=0, share=0.0, color=_analytics_risk_color(label))
            for label in ("Risiko Tinggi", "Risiko Sedang", "Risiko Rendah")
        ]
    total = int(len(df))
    counts = df.get("predicted_label", pd.Series("", index=df.index)).astype(str).value_counts()
    return [
        ArchiveDonutSegment(
            label=label,
            count=int(counts.get(label, 0)),
            share=round(float(counts.get(label, 0)) / total, 6) if total > 0 else 0.0,
            color=_analytics_risk_color(label),
        )
        for label in ("Risiko Tinggi", "Risiko Sedang", "Risiko Rendah")
    ]


def _monthly_risk_trend(df: pd.DataFrame, *, max_months: int = 18) -> List[MonthlyRiskTrendItem]:
    if df.empty or "date_published_dt" not in df.columns:
        return []
    valid = df.dropna(subset=["date_published_dt"]).copy()
    if valid.empty:
        return []
    valid["month"] = valid["date_published_dt"].dt.strftime("%Y-%m")
    grouped = valid.groupby("month", sort=True)
    rows: List[MonthlyRiskTrendItem] = []
    for month, chunk in grouped:
        labels = chunk["predicted_label"].astype(str)
        rows.append(
            MonthlyRiskTrendItem(
                month=str(month),
                tinggi=int(labels.eq("Risiko Tinggi").sum()),
                sedang=int(labels.eq("Risiko Sedang").sum()),
                rendah=int(labels.eq("Risiko Rendah").sum()),
                total=int(len(chunk)),
                average_priority=round(float(chunk["risk_priority_score"].mean() or 0.0), 6),
            )
        )
    return rows[-max_months:]


def _archive_date_range(df: pd.DataFrame) -> ArchiveDateRange:
    if "date_published_dt" not in df.columns or df.empty:
        return ArchiveDateRange()
    valid = df["date_published_dt"].dropna()
    invalid = int(len(df) - len(valid))
    if valid.empty:
        return ArchiveDateRange(valid_date_rows=0, invalid_date_rows=invalid)
    return ArchiveDateRange(
        start_month=valid.min().strftime("%Y-%m"),
        end_month=valid.max().strftime("%Y-%m"),
        valid_date_rows=int(len(valid)),
        invalid_date_rows=invalid,
    )


def _coverage_proof(metadata: ArchiveInferenceMetadata, matched_rows: int) -> ArchiveCoverageProof:
    return ArchiveCoverageProof(
        no_cloud_call=metadata.no_cloud_call,
        no_live_scraping=metadata.no_live_scraping,
        no_retraining=metadata.no_retraining,
        inference_mode=metadata.inference_mode,
        archive_scope=metadata.archive_scope,
        train_rows=metadata.train_rows,
        heldout_rows=metadata.heldout_rows,
        matched_rows=int(matched_rows),
        note=(
            "Inference dijalankan offline-local; arsip browsing tidak menggantikan "
            "klaim evaluasi held-out."
        ),
    )


def _build_archive_analytics_response(
    *,
    archive_queue: pd.DataFrame,
    metadata: ArchiveInferenceMetadata,
    filters: ArchiveAnalyticsFilters,
) -> ArchiveAnalyticsResponse:
    filtered = _filter_archive_rows(
        archive_queue,
        risk=filters.risk,
        split=filters.split,
        search=filters.search,
        buyer=filters.buyer,
        supplier=filters.supplier,
        region_key=filters.region_key,
        sort="risk_desc",
    )
    matched_rows = int(len(filtered))

    counts = ArchiveAnalyticsCounts(
        total_rows=int(len(archive_queue)),
        matched_rows=matched_rows,
        train_rows=int((archive_queue.get("source_split", pd.Series(dtype=str)) == "train_data").sum()),
        heldout_rows=int((archive_queue.get("source_split", pd.Series(dtype=str)) == "test_data").sum()),
        high_risk_rows=int((filtered.get("predicted_label", pd.Series(dtype=str)) == "Risiko Tinggi").sum()) if matched_rows else 0,
        medium_risk_rows=int((filtered.get("predicted_label", pd.Series(dtype=str)) == "Risiko Sedang").sum()) if matched_rows else 0,
        low_risk_rows=int((filtered.get("predicted_label", pd.Series(dtype=str)) == "Risiko Rendah").sum()) if matched_rows else 0,
    )

    points, point_meta = _archive_priority_map(filtered)

    region_items, region_meta = _archive_concentration(
        filtered,
        label_column="buyer_region",
        key_column="buyer_region_key",
        matched_rows=matched_rows,
    )
    buyer_items, buyer_meta = _archive_concentration(
        filtered,
        label_column="buyer",
        key_column="buyer",
        matched_rows=matched_rows,
    )

    monthly = _monthly_risk_trend(filtered)

    return ArchiveAnalyticsResponse(
        filters=filters,
        counts=counts,
        priority_map=points,
        priority_map_meta=point_meta,
        regional_concentration=region_items,
        regional_meta=region_meta,
        buyer_concentration=buyer_items,
        buyer_meta=buyer_meta,
        coverage_proof=_coverage_proof(metadata, matched_rows),
        monthly_trends=monthly,
        donut=_archive_donut(filtered),
        display_note=ARCHIVE_ANALYTICS_DISPLAY_NOTE,
        guardrail=SAFE_GUARDRAIL_ID,
    )


def _archive_analytics_cached(filters: ArchiveAnalyticsFilters) -> ArchiveAnalyticsResponse:
    key = (
        filters.risk,
        filters.split,
        filters.search.strip().casefold(),
        filters.buyer.strip().casefold(),
        filters.supplier.strip().casefold(),
        filters.region_key.strip().casefold(),
    )
    cached = _archive_analytics_cache.get(key)
    if cached is not None:
        return cached
    with _archive_analytics_lock:
        cached = _archive_analytics_cache.get(key)
        if cached is not None:
            return cached
        _, archive_queue, metadata = _load_archive_runtime()
        response = _build_archive_analytics_response(
            archive_queue=archive_queue,
            metadata=metadata,
            filters=filters,
        )
        _archive_analytics_cache[key] = response
        return response


# ---------------------------------------------------------------------------
# Casebook + review wiring
# ---------------------------------------------------------------------------


def _casebook_payload(case_id: str) -> Dict[str, Any]:
    dataset, backend, predictions, _, _ = _load_runtime()
    payload = build_casebook(case_id, dataset, predictions, backend)
    return payload


def _selected_export_html(case_id: str, payload: Dict[str, Any]) -> str:
    with TemporaryDirectory() as tmp:
        target = Path(tmp) / "casebook.html"
        render_static_casebook_html(payload, target)
        html = target.read_text(encoding="utf-8")

    disclosure = (
        "<!--LPSE-X-SELECTED-EXPORT "
        f"requested_case_id={case_id} "
        f"exported_case_id={payload.get('case_id')} "
        f"model_artifact={payload.get('provenance', {}).get('model_artifact')} "
        f"feature_source={payload.get('provenance', {}).get('feature_source')} "
        f"raw_source={payload.get('provenance', {}).get('raw_source')} "
        "-->"
    )
    if "<body" in html:
        html = html.replace("<body", disclosure + "\n<body", 1)
    else:
        html = disclosure + "\n" + html
    return html


@lru_cache(maxsize=1)
def _review_store() -> ReviewStore:
    return ReviewStore(REVIEW_DB_PATH)


def _review_snapshots(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    package_snapshot = {
        "case_id": payload.get("case_id"),
        "metadata": payload.get("metadata"),
        "guardrail_badges": payload.get("guardrail_badges"),
    }
    model_snapshot = {
        "model_output": payload.get("model_output"),
        "factors": payload.get("factors"),
        "explanation_state": payload.get("explanation_state"),
        "provenance": payload.get("provenance"),
    }
    return package_snapshot, model_snapshot


def _draft_review(case_id: str) -> Dict[str, Any]:
    payload = _casebook_payload(case_id)
    package_snapshot, model_snapshot = _review_snapshots(payload)
    prefill = {
        "reviewer_questions": payload.get("reviewer_questions", []),
        "narrative": payload.get("narrative", ""),
        "explanation_brief": payload.get("explanation_brief", {}),
    }
    now = utc_now_iso()
    return {
        "case_id": str(payload.get("case_id") or case_id),
        "status": DEFAULT_REVIEW_STATUS,
        "reviewer_name": None,
        "notes": None,
        "decision_summary": None,
        "package_snapshot": package_snapshot,
        "model_snapshot": model_snapshot,
        "prefill": prefill,
        "created_at": now,
        "updated_at": now,
        "signed_off_at": None,
        "is_saved": False,
        "event_count": 0,
        "history": [],
    }


def _review_record(payload: Dict[str, Any]) -> ReviewRecord:
    record = dict(payload)
    record.setdefault("guardrail", SAFE_GUARDRAIL_ID)
    return ReviewRecord(**record)


def _review_counts(items: Iterable[Dict[str, Any]]) -> Dict[str, int]:
    counts = {status: 0 for status in REVIEW_STATUSES}
    counts["all"] = 0
    for item in items:
        status = str(item.get("status") or DEFAULT_REVIEW_STATUS)
        counts[status] = counts.get(status, 0) + 1
        counts["all"] += 1
    return counts


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(app: FastAPI):
    if os.environ.get("LPSEX_PREWARM_ARCHIVE", "").lower() in {"1", "true", "yes"}:
        threading.Thread(target=_safe_prewarm, daemon=True).start()
    yield


def _safe_prewarm() -> None:
    try:
        _load_archive_runtime()
    except Exception:  # pragma: no cover - best effort
        return


app = FastAPI(
    title="LPSE-X Modern Web Command Center",
    version="1.0.0",
    description=(
        "Offline-local FastAPI service that wraps the LPSE-X ML primitives. "
        "Triase risiko + prioritas review, bukan tuduhan pelanggaran."
    ),
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
    allow_credentials=False,
)

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
def health_endpoint() -> HealthResponse:
    model_artifact: Optional[str] = None
    try:
        _, backend, _, _, _ = _load_runtime()
        model_artifact = Path(backend.model_artifact).name
    except DemoRuntimeError:
        model_artifact = None
    return HealthResponse(
        ok=True,
        mode="offline_local",
        model_artifact=model_artifact,
        guardrail=f"{SAFE_GUARDRAIL_ID} {HEALTH_GUARDRAIL_NOTE}",
    )


def _golden_path(demo_case_id: Optional[str]) -> List[GoldenPathStep]:
    base: List[GoldenPathStep] = [
        GoldenPathStep(label="Status Inferensi", href="/api/inference-status", description="Bukti inferensi held-out lokal."),
        GoldenPathStep(label="Antrean Review", href="/api/queue?demo=1&top_n=50", description="Top 50 paket prioritas review."),
        GoldenPathStep(label="Browser Dataset", href="/api/dataset?page=1&page_size=12", description="Telusuri dataset held-out berhalaman."),
        GoldenPathStep(label="Browser Arsip", href="/api/archive?page=1&page_size=100", description="Browsing arsip lokal dengan label split."),
        GoldenPathStep(label="Analytics Arsip", href="/api/archive/analytics", description="Agregat arsip terbatas dan aman."),
    ]
    if demo_case_id:
        base.extend(
            [
                GoldenPathStep(label="Casebook Terpilih", href=f"/api/casebook/{demo_case_id}", description="Penjelasan kasus terpilih."),
                GoldenPathStep(
                    label="Ekspor HTML Terpilih",
                    href=f"/api/casebook/{demo_case_id}/export.html",
                    description="Ekspor laporan statis kasus terpilih.",
                ),
            ]
        )
    return base


@app.get("/api/demo-state", response_model=DemoStateResponse)
def demo_state_endpoint() -> DemoStateResponse:
    try:
        dataset, backend, _, queue, metadata = _load_runtime()
    except DemoRuntimeError as exc:
        return DemoStateResponse(
            ready=False,
            offline_mode=True,
            guardrail=SAFE_GUARDRAIL_ID,
            production_build_status=_build_status(),
            error=_safe_error(exc),
        )

    demo_case_id = str(queue.iloc[0]["case_id"]) if not queue.empty else None
    queue_status = _inference_status(
        metadata,
        displayed_rows=min(DEFAULT_QUEUE_TOP_N, len(queue)),
        matched_rows=len(queue),
        queue_limit=DEFAULT_QUEUE_TOP_N,
    )

    return DemoStateResponse(
        ready=True,
        offline_mode=True,
        demo_case_id=demo_case_id,
        demo_queue_url="/api/queue?demo=1",
        casebook_url=f"/api/casebook/{demo_case_id}" if demo_case_id else None,
        export_html_url=f"/api/casebook/{demo_case_id}/export.html" if demo_case_id else None,
        model_artifact=Path(backend.model_artifact).name,
        feature_source=metadata.feature_source,
        raw_source=metadata.raw_source,
        inference_status=queue_status,
        guardrail=SAFE_GUARDRAIL_ID,
        golden_path_steps=_golden_path(demo_case_id),
        production_build_status=_build_status(),
    )


@app.get("/api/inference-status", response_model=InferenceStatus)
def inference_status_endpoint() -> InferenceStatus:
    try:
        _, _, _, queue, metadata = _load_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))
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
    risk: str = Query(default="all"),
    search: str = Query(default=""),
    buyer: str = Query(default=""),
    supplier: str = Query(default=""),
) -> QueueResponse:
    try:
        _, _, _, queue, metadata = _load_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))

    filtered, matched = _filter_queue(
        queue,
        risk=risk,
        search=search,
        buyer=buyer,
        supplier=supplier,
        top_n=top_n,
    )

    items = _records(filtered, columns=_dataset_columns(filtered))
    status = _inference_status(
        metadata,
        displayed_rows=len(items),
        matched_rows=matched,
        queue_limit=int(top_n),
    )
    demo_case_id = str(queue.iloc[0]["case_id"]) if demo and not queue.empty else None
    return QueueResponse(
        summary=_summary(filtered),
        distribution=_distribution(filtered),
        trend=_trend(filtered),
        items=items,
        matched_count=matched,
        inference_status=status,
        guardrail=SAFE_GUARDRAIL_ID,
        demo_case_id=demo_case_id,
    )


@app.get("/api/dataset", response_model=DatasetBrowserResponse)
def dataset_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_DATASET_PAGE_SIZE, ge=1, le=MAX_DATASET_PAGE_SIZE),
    risk: str = Query(default="all"),
    search: str = Query(default=""),
    buyer: str = Query(default=""),
    supplier: str = Query(default=""),
) -> DatasetBrowserResponse:
    try:
        _, _, _, queue, metadata = _load_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))

    filtered = _filter_ranked_rows(queue, risk=risk, search=search, buyer=buyer, supplier=supplier)
    page_items, effective_page, total_pages = _page_rows(filtered, page=page, page_size=page_size)
    columns = _dataset_columns(queue)
    items = _records(page_items, columns=columns)

    status = _inference_status(
        metadata,
        displayed_rows=len(items),
        matched_rows=int(len(filtered)),
        queue_limit=page_size,
    )
    return DatasetBrowserResponse(
        total_rows=int(len(queue)),
        matched_count=int(len(filtered)),
        page=effective_page,
        page_size=page_size,
        total_pages=total_pages,
        columns=columns,
        items=items,
        inference_status=status,
        display_note=DEFAULT_DATASET_DISPLAY_NOTE,
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/archive", response_model=ArchiveBrowserResponse)
def archive_endpoint(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_ARCHIVE_PAGE_SIZE, ge=1, le=MAX_DATASET_PAGE_SIZE),
    risk: str = Query(default="all"),
    split: str = Query(default="all"),
    search: str = Query(default=""),
    buyer: str = Query(default=""),
    supplier: str = Query(default=""),
    region_key: str = Query(default=""),
    sort: str = Query(default="risk_desc"),
) -> ArchiveBrowserResponse:
    if sort not in {"risk_desc", "date_desc", "value_desc"}:
        raise HTTPException(status_code=422, detail=f"Unsupported sort: {sort!r}")
    if split not in {"all", "train_data", "test_data"}:
        raise HTTPException(status_code=422, detail=f"Unsupported split: {split!r}")

    try:
        _, archive_queue, metadata = _load_archive_runtime()
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))

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
    page_items, effective_page, total_pages = _page_rows(filtered, page=page, page_size=page_size)
    columns = _archive_columns(archive_queue)
    items = _records(page_items, columns=columns)

    risk_distribution = _distribution(filtered)
    split_counts = filtered.get("source_split", pd.Series(dtype=str)).astype(str).value_counts()
    split_distribution = [
        DistributionItem(label=str(name), count=int(value))
        for name, value in split_counts.items()
    ]

    status = _archive_status(
        metadata,
        displayed_rows=len(items),
        matched_rows=int(len(filtered)),
        queue_limit=page_size,
    )
    return ArchiveBrowserResponse(
        total_rows=int(len(archive_queue)),
        matched_count=int(len(filtered)),
        page=effective_page,
        page_size=page_size,
        total_pages=total_pages,
        archive_scope=metadata.archive_scope,
        heldout_rows=metadata.heldout_rows,
        train_rows=metadata.train_rows,
        risk_distribution=risk_distribution,
        split_distribution=split_distribution,
        monthly_risk_trend=_monthly_risk_trend(filtered),
        date_range=_archive_date_range(filtered),
        columns=columns,
        items=items,
        inference_status=status,
        display_note=ARCHIVE_BROWSER_DISPLAY_NOTE,
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/archive/analytics", response_model=ArchiveAnalyticsResponse)
def archive_analytics_endpoint(
    risk: str = Query(default="all"),
    split: str = Query(default="all"),
    search: str = Query(default=""),
    buyer: str = Query(default=""),
    supplier: str = Query(default=""),
    region_key: str = Query(default=""),
) -> ArchiveAnalyticsResponse:
    if split not in {"all", "train_data", "test_data"}:
        raise HTTPException(status_code=422, detail=f"Unsupported split: {split!r}")

    filters = ArchiveAnalyticsFilters(
        risk=risk,
        split=split,
        search=search,
        buyer=buyer,
        supplier=supplier,
        region_key=region_key,
    )
    try:
        return _archive_analytics_cached(filters)
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))


@app.get("/api/casebook/{case_id}")
def casebook_endpoint(case_id: str) -> Dict[str, Any]:
    try:
        payload = _casebook_payload(case_id)
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=_safe_error(exc))
    payload["guardrail"] = payload.get("guardrail") or SAFE_GUARDRAIL_ID
    return JSONResponse(content=_json_safe(payload))


@app.get("/api/casebook/{case_id}/export.html", response_class=HTMLResponse)
def casebook_export_endpoint(case_id: str) -> HTMLResponse:
    try:
        payload = _casebook_payload(case_id)
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=_safe_error(exc))
    html = _selected_export_html(case_id, payload)
    return HTMLResponse(content=html, media_type="text/html; charset=utf-8")


@app.get("/api/static-casebook", response_model=StaticCasebookResponse)
def static_casebook_endpoint() -> StaticCasebookResponse:
    available = DEFAULT_STATIC_CASEBOOK_PATH.exists()
    return StaticCasebookResponse(
        available=available,
        primary_export=False,
        path=str(DEFAULT_STATIC_CASEBOOK_PATH) if available else None,
        note=(
            "Ekspor utama tetap melalui /api/casebook/{case_id}/export.html. "
            "demo_casebook.html adalah fallback statis opsional."
        ),
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/reviews", response_model=ReviewListResponse)
def reviews_list_endpoint(
    status: str = Query(default="all"),
    search: str = Query(default=""),
    top_n: int = Query(default=DEFAULT_REVIEW_TOP_N, ge=1, le=MAX_REVIEW_TOP_N),
) -> ReviewListResponse:
    if status != "all" and status not in REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown review status: {status!r}")

    raw_items = _review_store().list_reviews()
    counts = _review_counts(raw_items)

    filtered = raw_items
    if status != "all":
        filtered = [item for item in filtered if item.get("status") == status]
    search_norm = _normalize_text(search)
    if search_norm:
        filtered = [
            item
            for item in filtered
            if search_norm in _normalize_text(item.get("case_id"))
            or search_norm in _normalize_text(item.get("reviewer_name"))
            or search_norm in _normalize_text(item.get("notes"))
        ]

    bounded = filtered[:top_n]
    records = [_review_record(item) for item in bounded]
    return ReviewListResponse(
        statuses=REVIEW_STATUSES,
        counts=counts,
        items=records,
        guardrail=SAFE_GUARDRAIL_ID,
    )


@app.get("/api/reviews/{case_id}", response_model=ReviewRecord)
def reviews_get_endpoint(case_id: str) -> ReviewRecord:
    saved = _review_store().get_review(case_id)
    if saved is not None:
        return _review_record(saved)
    try:
        return _review_record(_draft_review(case_id))
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=_safe_error(exc))


@app.put("/api/reviews/{case_id}", response_model=ReviewRecord)
def reviews_put_endpoint(case_id: str, payload: ReviewUpdateRequest) -> ReviewRecord:
    if payload.status not in REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown review status: {payload.status!r}")
    try:
        casebook_payload = _casebook_payload(case_id)
    except DemoRuntimeError as exc:
        raise HTTPException(status_code=503, detail=_safe_error(exc))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=_safe_error(exc))

    package_snapshot, model_snapshot = _review_snapshots(casebook_payload)
    prefill = {
        "reviewer_questions": casebook_payload.get("reviewer_questions", []),
        "narrative": casebook_payload.get("narrative", ""),
        "explanation_brief": casebook_payload.get("explanation_brief", {}),
    }
    record = _review_store().upsert_review(
        case_id=str(casebook_payload.get("case_id") or case_id),
        status=payload.status,
        reviewer_name=payload.reviewer_name,
        notes=payload.notes,
        decision_summary=payload.decision_summary,
        package_snapshot=package_snapshot,
        model_snapshot=model_snapshot,
        prefill=prefill,
        signed_off=payload.signed_off,
    )
    return _review_record(record)


# ---------------------------------------------------------------------------
# Static SPA serving
# ---------------------------------------------------------------------------


def _missing_dist_payload() -> Dict[str, Any]:
    return {
        "frontend_dist_missing": True,
        "build_instruction": "cd frontend && npm ci && npm run build",
        "api_ready": True,
        "guardrail": SAFE_GUARDRAIL_ID,
    }


@app.get("/")
def spa_root() -> Any:
    index_html = FRONTEND_DIST / "index.html"
    if index_html.exists():
        return FileResponse(index_html, media_type="text/html")
    return JSONResponse(content=_missing_dist_payload(), status_code=200)


@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> Any:
    if full_path.startswith("api") or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail=f"Unknown API route: /{full_path}")
    if full_path.startswith("assets/"):
        candidate = ASSETS_DIR / Path(full_path[len("assets/") :])
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        raise HTTPException(status_code=404, detail=f"Asset not found: /{full_path}")

    index_html = FRONTEND_DIST / "index.html"
    if index_html.exists():
        return FileResponse(index_html, media_type="text/html")
    return JSONResponse(content=_missing_dist_payload(), status_code=200)
