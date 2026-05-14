"""Pydantic API contracts for the LPSE-X FastAPI command center."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProductionBuildStatus(BaseModel):
    dist_present: bool
    served_by_fastapi: bool
    index_html: str


class HealthResponse(BaseModel):
    ok: bool = True
    mode: str = "offline_local"
    model_artifact: str | None = None
    guardrail: str


class InferenceStatus(BaseModel):
    model_artifact: str
    model_backend: str
    inference_mode: str = "offline_local"
    feature_source: str
    raw_source: str
    source_split: str
    rows_scored: int
    rows_ranked: int
    rows_displayed: int
    matched_rows: int | None = None
    queue_limit: int
    loaded_rows_cap: int | None = None
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


class DemoStateResponse(BaseModel):
    ready: bool
    offline_mode: bool = True
    demo_case_id: str | None = None
    demo_queue_url: str = "/api/queue?demo=1"
    casebook_url: str | None = None
    export_html_url: str | None = None
    model_artifact: str | None = None
    feature_source: str | None = None
    raw_source: str | None = None
    inference_status: InferenceStatus | None = None
    guardrail: str
    golden_path_steps: list[str] = Field(default_factory=list)
    production_build_status: ProductionBuildStatus
    error: str | None = None


class QueueResponse(BaseModel):
    summary: dict[str, int]
    distribution: list[dict[str, Any]]
    trend: list[dict[str, Any]]
    items: list[dict[str, Any]]
    matched_count: int | None = None
    inference_status: InferenceStatus | None = None
    guardrail: str
    demo_case_id: str | None = None


class DatasetBrowserResponse(BaseModel):
    total_rows: int
    matched_count: int
    page: int
    page_size: int
    total_pages: int
    columns: list[str]
    items: list[dict[str, Any]]
    inference_status: InferenceStatus
    display_note: str
    guardrail: str


class ArchiveInferenceStatus(BaseModel):
    model_artifact: str
    model_backend: str
    inference_mode: str = "offline_local"
    archive_scope: str
    rows_scored: int
    rows_ranked: int
    rows_displayed: int
    matched_rows: int | None = None
    queue_limit: int
    train_rows: int
    heldout_rows: int
    feature_sources: list[str]
    raw_sources: list[str]
    source_splits: list[str]
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


class MonthlyRiskTrendItem(BaseModel):
    month: str
    tinggi: int
    sedang: int
    rendah: int
    total: int
    average_priority: float


class ArchiveDateRange(BaseModel):
    start_month: str | None = None
    end_month: str | None = None
    valid_date_rows: int
    invalid_date_rows: int


class ArchiveBrowserResponse(BaseModel):
    total_rows: int
    matched_count: int
    page: int
    page_size: int
    total_pages: int
    archive_scope: str
    heldout_rows: int
    train_rows: int
    risk_distribution: dict[str, int]
    split_distribution: dict[str, int]
    monthly_risk_trend: list[MonthlyRiskTrendItem]
    date_range: ArchiveDateRange
    columns: list[str]
    items: list[dict[str, Any]]
    inference_status: ArchiveInferenceStatus
    display_note: str
    guardrail: str


class ArchiveAnalyticsFilters(BaseModel):
    risk: str
    split: str
    search: str
    buyer: str
    supplier: str
    sort: str
    region_key: str = ""


class ArchiveAnalyticsCounts(BaseModel):
    total_rows: int
    matched_count: int
    train_rows: int
    heldout_rows: int
    risk_distribution: dict[str, int]
    split_distribution: dict[str, int]


class ArchivePriorityPoint(BaseModel):
    archive_id: str
    case_id: str
    source_split: str
    is_heldout: bool
    eval_claim_scope: str
    title: str
    buyer: str
    supplier: str
    region: str
    risk_label: str
    filter_value: str
    risk_score: float
    probability_high: float | None = None
    contract_value: float | None = None
    tender_value_display: str
    filtered_rank: int
    archive_page: int


class ArchivePriorityMapMeta(BaseModel):
    point_limit: int = 500
    points_returned: int
    matched_count: int
    total_value_candidates: int
    is_capped: bool
    sample_strategy: str
    null_value_rows: int
    zero_value_rows: int


class ArchiveConcentrationItem(BaseModel):
    label: str
    count: int
    percent: float
    high_risk_count: int
    high_risk_percent: float
    total_contract_value: float
    average_risk_score: float
    region: str | None = None
    region_type: str | None = None
    region_source: str | None = None
    region_note: str | None = None
    buyer: str | None = None


class ArchiveRegionMapItem(BaseModel):
    region_key: str
    map_key: str | None = None
    label: str
    province: str | None = None
    region_type: str
    status: str
    geo_match_status: str
    count: int
    percent: float
    high_risk_count: int
    high_risk_percent: float
    total_contract_value: float
    average_risk_score: float
    region_source: str | None = None
    region_note: str | None = None
    filter_value: str


class ArchiveRegionMapMeta(BaseModel):
    asset_path: str
    attribution_path: str
    source_url: str
    source_commit: str
    license: str
    feature_count: int
    matched_count: int
    regions_returned: int
    matched_regions: int
    mapped_regions: int
    unmatched_regions: int
    unsupported_regions: int
    unsupported_level_regions: int
    source_note: str
    geojson_source: str
    geojson_license: str
    map_granularity: str
    note: str


class ArchiveConcentrationMeta(BaseModel):
    limit: int = 12
    returned: int
    matched_count: int
    is_capped: bool
    sort: str
    note: str


class ArchiveCoverageProof(BaseModel):
    archive_scope: str
    total_rows: int
    matched_count: int
    train_rows: int
    heldout_rows: int
    filtered_train_rows: int
    filtered_heldout_rows: int
    source_splits: list[str]
    feature_sources: list[str]
    raw_sources: list[str]
    eval_claim_note: str
    archive_display_note: str
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True


class ArchiveDonutSegment(BaseModel):
    label: str
    filter_value: str
    count: int
    percent: float
    color: str


class ArchiveAnalyticsResponse(BaseModel):
    filters: ArchiveAnalyticsFilters
    counts: ArchiveAnalyticsCounts
    priority_map: list[ArchivePriorityPoint]
    priority_map_meta: ArchivePriorityMapMeta
    regional_concentration: list[ArchiveConcentrationItem]
    regional_meta: ArchiveConcentrationMeta
    region_map: list[ArchiveRegionMapItem]
    region_map_meta: ArchiveRegionMapMeta
    buyer_concentration: list[ArchiveConcentrationItem]
    buyer_meta: ArchiveConcentrationMeta
    coverage_proof: ArchiveCoverageProof
    monthly_trends: list[MonthlyRiskTrendItem]
    donut: list[ArchiveDonutSegment]
    display_note: str
    guardrail: str


class StaticCasebookResponse(BaseModel):
    available: bool
    path: str
    primary_export: bool = False
    primary_export_route: str = "/api/casebook/{case_id}/export.html"
    guardrail: str

class ReviewUpdateRequest(BaseModel):
    status: str
    reviewer_name: str = ""
    notes: str = ""
    decision_summary: str = ""
    signed_off: bool = False

class ReviewRecord(BaseModel):
    case_id: str
    status: str
    reviewer_name: str = ""
    notes: str = ""
    decision_summary: str = ""
    package_snapshot: dict[str, Any]
    model_snapshot: dict[str, Any]
    prefill: dict[str, Any]
    created_at: str | None = None
    updated_at: str | None = None
    signed_off_at: str | None = None
    is_saved: bool = False
    event_count: int = 0
    history: list[dict[str, Any]] = Field(default_factory=list)
    guardrail: str

class ReviewListResponse(BaseModel):
    statuses: list[str]
    counts: dict[str, int]
    items: list[ReviewRecord]
    page: int = 1
    page_size: int = 100
    total_items: int = 0
    total_pages: int = 1
    top_n: int = 500
    guardrail: str
