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
