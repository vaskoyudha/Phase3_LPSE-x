export interface ProductionBuildStatus {
  dist_present: boolean;
  served_by_fastapi: boolean;
  index_html: string;
}

export interface InferenceStatus {
  model_artifact: string;
  model_backend: string;
  inference_mode: string;
  feature_source: string;
  raw_source: string;
  source_split: string;
  rows_scored: number;
  rows_ranked: number;
  rows_displayed: number;
  matched_rows: number | null;
  queue_limit: number;
  loaded_rows_cap: number | null;
  data_load_latency_ms: number;
  model_load_latency_ms: number;
  prediction_latency_ms: number;
  queue_build_latency_ms: number;
  total_latency_ms: number;
  generated_at: string;
  no_cloud_call: boolean;
  no_live_scraping: boolean;
  no_retraining: boolean;
  display_note: string;
  guardrail: string;
}

export interface ArchiveInferenceStatus {
  model_artifact: string;
  model_backend: string;
  inference_mode: string;
  archive_scope: string;
  rows_scored: number;
  rows_ranked: number;
  rows_displayed: number;
  matched_rows: number | null;
  queue_limit: number;
  train_rows: number;
  heldout_rows: number;
  feature_sources: string[];
  raw_sources: string[];
  source_splits: string[];
  data_load_latency_ms: number;
  model_load_latency_ms: number;
  prediction_latency_ms: number;
  queue_build_latency_ms: number;
  total_latency_ms: number;
  generated_at: string;
  no_cloud_call: boolean;
  no_live_scraping: boolean;
  no_retraining: boolean;
  display_note: string;
  guardrail: string;
}

export interface DemoState {
  ready: boolean;
  offline_mode: boolean;
  demo_case_id: string | null;
  demo_queue_url: string;
  casebook_url: string | null;
  export_html_url: string | null;
  model_artifact: string | null;
  feature_source: string | null;
  raw_source: string | null;
  inference_status: InferenceStatus | null;
  guardrail: string;
  golden_path_steps: string[];
  production_build_status: ProductionBuildStatus;
  error?: string | null;
}

export interface QueueItem {
  case_id: string;
  row_id?: string | number;
  ocid?: string;
  tender_id?: string;
  risk_rank: number;
  archive_rank?: number;
  split_risk_rank?: number;
  source_split?: 'train_data' | 'test_data' | string;
  is_heldout?: boolean;
  eval_claim_scope?: 'heldout_test_only' | 'archive_browsing_only' | string;
  package_title: string;
  buyer: string;
  supplier: string;
  tender_value_display: string;
  procurement_method: string;
  predicted_label: string;
  probability: number;
  risk_priority_score: number;
  probability_low?: number;
  probability_medium?: number;
  probability_high?: number;
  review_status: string;
  buyer_region?: string;
  buyer_region_type?: string;
  buyer_region_source?: 'derived_from_buyer_name' | string;
  buyer_region_note?: string;
  buyer_region_key?: string;
  region_key?: string;
}

export interface QueueResponse {
  summary: Record<string, number>;
  distribution: Array<{ label: string; count: number }>;
  trend: Array<{ bucket: string; average_priority: number; review_count: number }>;
  items: QueueItem[];
  matched_count: number | null;
  inference_status: InferenceStatus | null;
  guardrail: string;
  demo_case_id: string | null;
}

export interface DatasetRow extends QueueItem {
  category?: string;
  status?: string;
  date_published?: string;
}

export interface DatasetBrowserResponse {
  total_rows: number;
  matched_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  columns: string[];
  items: DatasetRow[];
  inference_status: InferenceStatus;
  display_note: string;
  guardrail: string;
}

export interface ArchiveRow extends DatasetRow {
  archive_id: string;
  archive_rank: number;
  split_risk_rank: number;
  source_split: 'train_data' | 'test_data' | string;
  is_heldout: boolean;
  eval_claim_scope: 'heldout_test_only' | 'archive_browsing_only' | string;
  buyer_region?: string;
  buyer_region_type?: string;
  buyer_region_source?: 'derived_from_buyer_name' | string;
  buyer_region_note?: string;
  buyer_region_key?: string;
  region_key?: string;
}

export interface ArchiveMonthlyRiskTrend {
  month: string;
  tinggi: number;
  sedang: number;
  rendah: number;
  total: number;
  average_priority: number;
}

export interface ArchiveDateRange {
  start_month: string | null;
  end_month: string | null;
  valid_date_rows: number;
  invalid_date_rows: number;
}

export interface ArchiveBrowserResponse {
  total_rows: number;
  matched_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  archive_scope: string;
  heldout_rows: number;
  train_rows: number;
  risk_distribution: Record<string, number>;
  split_distribution: Record<string, number>;
  monthly_risk_trend: ArchiveMonthlyRiskTrend[];
  date_range: ArchiveDateRange;
  columns: string[];
  items: ArchiveRow[];
  inference_status: ArchiveInferenceStatus;
  display_note: string;
  guardrail: string;
}

export interface ArchiveAnalyticsFilters {
  risk: string;
  split: string;
  search: string;
  buyer: string;
  supplier: string;
  sort: string;
  region_key?: string;
}
