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

export interface ArchiveAnalyticsCounts {
  total_rows: number;
  matched_count: number;
  train_rows: number;
  heldout_rows: number;
  risk_distribution: Record<string, number>;
  split_distribution: Record<string, number>;
}

export interface ArchivePriorityPoint {
  archive_id: string;
  case_id: string;
  source_split: string;
  is_heldout: boolean;
  eval_claim_scope: string;
  title: string;
  buyer: string;
  supplier: string;
  region: string;
  risk_label: string;
  filter_value: string;
  risk_score: number;
  probability_high: number | null;
  contract_value: number | null;
  tender_value_display: string;
  filtered_rank: number;
  archive_page: number;
}

export interface ArchivePriorityMapMeta {
  point_limit: number;
  points_returned: number;
  matched_count: number;
  total_value_candidates: number;
  is_capped: boolean;
  sample_strategy: string;
  null_value_rows: number;
  zero_value_rows: number;
}

export interface ArchiveConcentrationItem {
  label: string;
  count: number;
  percent: number;
  high_risk_count: number;
  high_risk_percent: number;
  total_contract_value: number;
  average_risk_score: number;
  region: string | null;
  region_type: string | null;
  region_source: string | null;
  region_note: string | null;
  buyer: string | null;
}

export interface ArchiveConcentrationMeta {
  limit: number;
  returned: number;
  matched_count: number;
  is_capped: boolean;
  sort: string;
  note: string;
}

export interface ArchiveRegionMapItem {
  region_key: string;
  map_key: string | null;
  label: string;
  province: string | null;
  region_type: 'kabupaten' | 'kota' | 'provinsi' | 'unknown' | string;
  status?: 'matched' | 'unmatched' | 'unsupported_level' | string;
  geo_match_status?: 'matched' | 'unmatched' | 'unsupported_level' | string;
  count: number;
  percent: number;
  high_risk_count: number;
  high_risk_percent: number;
  total_contract_value: number;
  average_risk_score: number;
  region_source: string | null;
  region_note: string | null;
  filter_value: string;
}

export interface ArchiveRegionMapMeta {
  asset_path?: string;
  attribution_path?: string;
  source_url?: string;
  source_commit?: string;
  license?: string;
  feature_count?: number;
  matched_count: number;
  regions_returned?: number;
  mapped_regions?: number;
  matched_regions: number;
  unmatched_regions: number;
  unsupported_regions?: number;
  unsupported_level_regions?: number;
  source_note?: string;
  geojson_source?: string;
  geojson_license?: string;
  map_granularity?: 'kabupaten_kota';
  note: string;
}

export interface ArchiveCoverageProof {
  archive_scope: string;
  total_rows: number;
  matched_count: number;
  train_rows: number;
  heldout_rows: number;
  filtered_train_rows: number;
  filtered_heldout_rows: number;
  source_splits: string[];
  feature_sources: string[];
  raw_sources: string[];
  eval_claim_note: string;
  archive_display_note: string;
  no_cloud_call: boolean;
  no_live_scraping: boolean;
  no_retraining: boolean;
}

export interface ArchiveDonutSegment {
  label: string;
  filter_value: string;
  count: number;
  percent: number;
  color: string;
}

export interface ArchiveAnalyticsResponse {
  filters: ArchiveAnalyticsFilters;
  counts: ArchiveAnalyticsCounts;
  priority_map: ArchivePriorityPoint[];
  priority_map_meta: ArchivePriorityMapMeta;
  regional_concentration: ArchiveConcentrationItem[];
  regional_meta: ArchiveConcentrationMeta;
  region_map: ArchiveRegionMapItem[];
  region_map_meta: ArchiveRegionMapMeta;
  buyer_concentration: ArchiveConcentrationItem[];
  buyer_meta: ArchiveConcentrationMeta;
  coverage_proof: ArchiveCoverageProof;
  monthly_trends: ArchiveMonthlyRiskTrend[];
  donut: ArchiveDonutSegment[];
  display_note: string;
  guardrail: string;
}

export type ReviewStatus =
  | 'Perlu Review'
  | 'Sedang Direview'
  | 'Butuh Bukti Tambahan'
  | 'Ditandai Risiko'
  | 'Clear / Tidak Prioritas'
  | 'Selesai';
