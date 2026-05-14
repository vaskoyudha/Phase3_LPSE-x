"""Pydantic API schemas shared between FastAPI backend and the React frontend.

Single source of truth for JSON shapes returned by `src/api.py`. Keep this file
small, explicit, and compatible with `frontend/src/types/api.ts`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Build / health
# ---------------------------------------------------------------------------


class ProductionBuildStatus(BaseModel):
    """Reports whether the React/Vite build is present and being served."""

    dist_present: bool = False
    served_by_fastapi: bool = False
    index_html: str = ""


class HealthResponse(BaseModel):
    ok: bool = True
    mode: str = "offline_local"
    model_artifact: Optional[str] = None
    guardrail: str


# ---------------------------------------------------------------------------
# Inference status
# ---------------------------------------------------------------------------


class InferenceStatus(BaseModel):
    """Provenance + latency for one cached held-out inference run."""

    model_config = ConfigDict(protected_namespaces=())

    model_artifact: str
    model_backend: str
    inference_mode: str = "offline_local"
    feature_source: str
    raw_source: str
    source_split: str
    rows_scored: int
    rows_ranked: int
    rows_displayed: int
    matched_rows: Optional[int] = None
    queue_limit: int
    loaded_rows_cap: Optional[int] = None
    data_load_latency_ms: float
    model_load_latency_ms: float
    prediction_latency_ms: float
    queue_build_latency_ms: float
    total_latency_ms: float
    generated_at: str
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    display_note: str
    guardrail: str


class ArchiveInferenceStatus(InferenceStatus):
    """Archive runtime metadata. Adds split scope without dropping held-out fields."""

    archive_scope: str
    train_rows: int
    heldout_rows: int
    feature_sources: List[str]
    raw_sources: List[str]
    source_splits: List[str]


# ---------------------------------------------------------------------------
# Demo state
# ---------------------------------------------------------------------------


class GoldenPathStep(BaseModel):
    label: str
    href: str
    description: Optional[str] = None


class DemoStateResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    ready: bool = False
    offline_mode: bool = True
    demo_case_id: Optional[str] = None
    demo_queue_url: Optional[str] = None
    casebook_url: Optional[str] = None
    export_html_url: Optional[str] = None
    model_artifact: Optional[str] = None
    feature_source: Optional[str] = None
    raw_source: Optional[str] = None
    inference_status: Optional[InferenceStatus] = None
    guardrail: str
    golden_path_steps: List[GoldenPathStep] = Field(default_factory=list)
    production_build_status: ProductionBuildStatus = Field(default_factory=ProductionBuildStatus)
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Queue / dataset / archive items
# ---------------------------------------------------------------------------


class SummaryCounts(BaseModel):
    total: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class DistributionItem(BaseModel):
    label: str
    count: int


class TrendBucket(BaseModel):
    bucket: str
    average_priority: float = 0.0
    review_count: int = 0


class QueueResponse(BaseModel):
    summary: SummaryCounts
    distribution: List[DistributionItem]
    trend: List[TrendBucket]
    items: List[Dict[str, Any]]
    matched_count: Optional[int] = None
    inference_status: InferenceStatus
    guardrail: str
    demo_case_id: Optional[str] = None


class DatasetBrowserResponse(BaseModel):
    total_rows: int
    matched_count: int
    page: int
    page_size: int
    total_pages: int
    columns: List[str]
    items: List[Dict[str, Any]]
    inference_status: InferenceStatus
    display_note: str
    guardrail: str


# ---------------------------------------------------------------------------
# Archive browser + analytics
# ---------------------------------------------------------------------------


class MonthlyRiskTrendItem(BaseModel):
    month: str
    tinggi: int = 0
    sedang: int = 0
    rendah: int = 0
    total: int = 0
    average_priority: float = 0.0


class ArchiveDateRange(BaseModel):
    start_month: Optional[str] = None
    end_month: Optional[str] = None
    valid_date_rows: int = 0
    invalid_date_rows: int = 0


class ArchiveBrowserResponse(BaseModel):
    total_rows: int
    matched_count: int
    page: int
    page_size: int
    total_pages: int
    archive_scope: str
    heldout_rows: int
    train_rows: int
    risk_distribution: List[DistributionItem]
    split_distribution: List[DistributionItem]
    monthly_risk_trend: List[MonthlyRiskTrendItem]
    date_range: ArchiveDateRange
    columns: List[str]
    items: List[Dict[str, Any]]
    inference_status: ArchiveInferenceStatus
    display_note: str
    guardrail: str


class ArchiveAnalyticsFilters(BaseModel):
    risk: str = "all"
    split: str = "all"
    search: str = ""
    buyer: str = ""
    supplier: str = ""
    region_key: str = ""


class ArchiveAnalyticsCounts(BaseModel):
    total_rows: int = 0
    matched_rows: int = 0
    train_rows: int = 0
    heldout_rows: int = 0
    high_risk_rows: int = 0
    medium_risk_rows: int = 0
    low_risk_rows: int = 0


class ArchivePriorityPoint(BaseModel):
    archive_id: str
    case_id: str
    risk_label: str
    risk_color: str
    risk_priority_score: float
    contract_value: Optional[float] = None
    contract_value_display: Optional[str] = None
    buyer: Optional[str] = None
    buyer_region: Optional[str] = None
    buyer_region_key: Optional[str] = None
    source_split: str
    is_heldout: bool
    eval_claim_scope: str
    date_published: Optional[str] = None


class ArchivePriorityMapMeta(BaseModel):
    point_limit: int
    sample_strategy: str
    is_capped: bool
    matched_rows: int
    returned_points: int


class ArchiveConcentrationItem(BaseModel):
    label: str
    key: str
    count: int = 0
    risk_priority_score: float = 0.0
    high_risk_rows: int = 0
    share: float = 0.0


class ArchiveConcentrationMeta(BaseModel):
    limit: int
    matched_groups: int
    returned_groups: int
    is_capped: bool


class ArchiveCoverageProof(BaseModel):
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    inference_mode: str = "offline_local"
    archive_scope: str
    train_rows: int
    heldout_rows: int
    matched_rows: int
    note: str


class ArchiveDonutSegment(BaseModel):
    label: str
    count: int
    share: float
    color: str


class ArchiveAnalyticsResponse(BaseModel):
    filters: ArchiveAnalyticsFilters
    counts: ArchiveAnalyticsCounts
    priority_map: List[ArchivePriorityPoint]
    priority_map_meta: ArchivePriorityMapMeta
    regional_concentration: List[ArchiveConcentrationItem]
    regional_meta: ArchiveConcentrationMeta
    buyer_concentration: List[ArchiveConcentrationItem]
    buyer_meta: ArchiveConcentrationMeta
    coverage_proof: ArchiveCoverageProof
    monthly_trends: List[MonthlyRiskTrendItem]
    donut: List[ArchiveDonutSegment]
    display_note: str
    guardrail: str


# ---------------------------------------------------------------------------
# Static casebook / review
# ---------------------------------------------------------------------------


class StaticCasebookResponse(BaseModel):
    available: bool
    primary_export: bool = False
    path: Optional[str] = None
    note: str
    guardrail: str


class ReviewUpdateRequest(BaseModel):
    status: str
    reviewer_name: Optional[str] = None
    notes: Optional[str] = None
    decision_summary: Optional[str] = None
    signed_off: bool = False


class ReviewRecord(BaseModel):
    case_id: str
    status: str
    reviewer_name: Optional[str] = None
    notes: Optional[str] = None
    decision_summary: Optional[str] = None
    package_snapshot: Dict[str, Any] = Field(default_factory=dict)
    model_snapshot: Dict[str, Any] = Field(default_factory=dict)
    prefill: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    signed_off_at: Optional[str] = None
    is_saved: bool = False
    event_count: int = 0
    history: List[Dict[str, Any]] = Field(default_factory=list)
    guardrail: str


class ReviewListResponse(BaseModel):
    statuses: List[str]
    counts: Dict[str, int]
    items: List[ReviewRecord]
    guardrail: str
