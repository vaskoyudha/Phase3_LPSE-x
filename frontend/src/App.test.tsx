import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { LandingPage } from './pages/LandingPage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { FilterRail, type Filters } from './components/dashboard/FilterRail';
import { KpiCards } from './components/dashboard/KpiCards';
import { RiskQueueTable } from './components/dashboard/RiskQueueTable';
import { SelectedCasePreview } from './components/dashboard/SelectedCasePreview';
import { InferenceStatusCard } from './components/dashboard/InferenceStatusCard';
import { ScoredDatasetExplorer } from './components/dashboard/ScoredDatasetExplorer';
import { ArchiveAnalyticsPanel } from './components/dashboard/ArchiveAnalyticsPanel';
import { LokasiMap } from './components/dashboard/LokasiMap';
import { RiskTrendChart } from './components/dashboard/RiskTrendChart';
import { RiskDistributionChart } from './components/dashboard/RiskDistributionChart';
import { ShapFactorBars } from './components/casebook/ShapFactorBars';
import { CasebookPage } from './pages/CasebookPage';
import { ModelTransparencyPage } from './pages/ModelTransparencyPage';
import type { ArchiveAnalyticsResponse, CasebookPayload, ArchiveBrowserResponse, DemoState, QueueItem, QueueResponse, ReviewListResponse, ReviewRecord } from './types/api';

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState(null, '', '/');
});

const demoState: DemoState = {
  ready: true,
  offline_mode: true,
  demo_case_id: '10:ocds-a',
  demo_queue_url: '/api/queue?demo=1',
  casebook_url: '/api/casebook/10:ocds-a',
  export_html_url: '/api/casebook/10:ocds-a/export.html',
  model_artifact: 'model_risk.ubj',
  feature_source: 'test_data/features.parquet',
  raw_source: 'test_data/raw.parquet',
  inference_status: {
    model_artifact: 'model_risk.ubj',
    model_backend: 'xgboost',
    inference_mode: 'offline_local',
    feature_source: 'test_data/features.parquet',
    raw_source: 'test_data/raw.parquet',
    source_split: 'test_data',
    rows_scored: 93034,
    rows_ranked: 93034,
    rows_displayed: 50,
    matched_rows: 93034,
    queue_limit: 50,
    loaded_rows_cap: null,
    data_load_latency_ms: 100,
    model_load_latency_ms: 200,
    prediction_latency_ms: 300,
    queue_build_latency_ms: 400,
    total_latency_ms: 1000,
    generated_at: '2026-05-06T00:00:00Z',
    no_cloud_call: true,
    no_live_scraping: true,
    no_retraining: true,
    display_note: 'Seluruh test_data/features.parquet diberi skor secara lokal; UI hanya menampilkan antrean prioritas teratas agar reviewer fokus.',
    guardrail: 'Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran.',
  },
  guardrail: 'Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran.',
  golden_path_steps: ['Open Command Center'],
  production_build_status: { dist_present: true, served_by_fastapi: true, index_html: 'frontend/dist/index.html' },
};

const queueItem: QueueItem = {
  case_id: '10:ocds-a',
  risk_rank: 1,
  package_title: 'Pembangunan Jalan Lingkar Selatan Kab. X',
  buyer: 'Pemerintah Kabupaten X',
  supplier: 'PT. Maju Konstruksi Indonesia',
  tender_value_display: 'Rp 87,450,000,000',
  procurement_method: 'Tender',
  predicted_label: 'Risiko Tinggi',
  probability: 0.92,
  risk_priority_score: 0.92,
  review_status: 'Perlu Review',
  buyer_region: 'Kabupaten X',
  buyer_region_type: 'kabupaten',
  buyer_region_key: 'kabupaten-x',
  buyer_region_source: 'derived_from_buyer_name',
  buyer_region_note: 'Derived from buyer_name display only.',
};

const casebook = {
  generated_at: '2026-05-06T00:00:00Z',
  case_id: queueItem.case_id,
  metadata: { package_title: queueItem.package_title, buyer: queueItem.buyer, supplier: queueItem.supplier, tender_value_display: queueItem.tender_value_display, date_published: '12 Oktober 2024', category: 'Pekerjaan Konstruksi' },
  model_output: { predicted_label: 'Risiko Tinggi', probability: 0.92, probabilities: [0.03, 0.05, 0.92], risk_rank: 1, risk_priority_score: 0.92 },
  factors: [
    { feature: 'repeat', feature_label: 'Buyer-supplier repeat relationship', value: 1, shap_value: 0.256, direction: 'increases_risk' },
    { feature: 'price', feature_label: 'Price deviation ratio', value: 2, shap_value: 0.213, direction: 'increases_risk' },
    { feature: 'complete', feature_label: 'Description completeness', value: 3, shap_value: -0.094, direction: 'decreases_risk' },
  ],
  narrative: '',
  explanation_brief: {
    summary: 'Paket ini masuk prioritas Risiko Tinggi karena model melihat sinyal utama: hubungan buyer-supplier berulang dan deviasi harga. Gunakan ringkasan ini sebagai arahan review awal, bukan kesimpulan pelanggaran.',
    confidence_label: 'Keyakinan model sangat tinggi',
    model_interpretation: 'Model mengelompokkan paket sebagai Risiko Tinggi. Angka probabilitas dipakai untuk mengurutkan prioritas review, bukan untuk menyatakan kepastian hukum.',
    top_drivers: [
      {
        feature: 'repeat',
        title: 'Hubungan buyer-supplier berulang',
        human_label: 'Buyer-supplier repeat relationship',
        value_display: '1',
        shap_value: 0.256,
        impact_label: 'dampak sedang',
        direction: 'increases_risk',
        direction_label: 'Menaikkan prioritas review',
        reason: 'Model melihat relasi buyer-supplier yang berulang sehingga perlu konteks historis.',
        reviewer_check: 'Tinjau daftar paket sebelumnya, metode pengadaan, dan alasan administratif relasi berulang.',
      },
      {
        feature: 'price',
        title: 'Deviasi harga perlu konteks',
        human_label: 'Price deviation ratio',
        value_display: '2',
        shap_value: 0.213,
        impact_label: 'dampak kecil',
        direction: 'increases_risk',
        direction_label: 'Menaikkan prioritas review',
        reason: 'Rasio harga berbeda dari nilai acuan yang dipakai fitur model.',
        reviewer_check: 'Bandingkan nilai penawaran, HPS, pagu, dan dokumen evaluasi harga.',
      },
    ],
    risk_reducers: [
      {
        feature: 'complete',
        title: 'Kelengkapan deskripsi tender',
        human_label: 'Description completeness',
        value_display: '3',
        shap_value: -0.094,
        impact_label: 'dampak kecil',
        direction: 'decreases_risk',
        direction_label: 'Menurunkan prioritas review',
        reason: 'Panjang deskripsi membantu model membaca kelengkapan informasi paket.',
        reviewer_check: 'Pastikan spesifikasi, volume, lokasi, dan keluaran pekerjaan tertulis jelas.',
      },
    ],
    reviewer_checklist: [
      'Tinjau daftar paket sebelumnya, metode pengadaan, dan alasan administratif relasi berulang.',
      'Bandingkan nilai penawaran, HPS, pagu, dan dokumen evaluasi harga.',
      'Pastikan semua kesimpulan mengacu pada dokumen LPSE/kontrak resmi dan konteks administratif.',
    ],
    shap_note: 'SHAP menunjukkan faktor mana yang menggeser skor model naik atau turun dari baseline. Nilai SHAP besar berarti pengaruh model lebih kuat, bukan bukti pelanggaran.',
    safety_note: 'Catatan penting: ini adalah triase risiko untuk prioritas review, bukan tuduhan pelanggaran atau putusan akhir.',
  },
  reviewer_questions: [],
  guardrail: demoState.guardrail,
  heuristic_label_note: '',
  guardrail_badges: [],
  provenance: {},
} satisfies CasebookPayload;

const reviewRecord: ReviewRecord = {
  case_id: queueItem.case_id,
  status: 'Perlu Review',
  reviewer_name: '',
  notes: '',
  decision_summary: '',
  package_snapshot: {
    package_title: queueItem.package_title,
    buyer: queueItem.buyer,
    supplier: queueItem.supplier,
    tender_value_display: queueItem.tender_value_display,
    procurement_method: queueItem.procurement_method,
  },
  model_snapshot: {
    predicted_label: queueItem.predicted_label,
    probability: queueItem.probability,
    risk_rank: queueItem.risk_rank,
    risk_priority_score: queueItem.risk_priority_score,
  },
  prefill: {
    rationale: casebook.explanation_brief.summary,
    checklist: casebook.explanation_brief.reviewer_checklist,
    top_drivers: casebook.explanation_brief.top_drivers,
  },
  created_at: null,
  updated_at: null,
  signed_off_at: null,
  is_saved: false,
  event_count: 0,
  history: [],
  guardrail: demoState.guardrail,
};

const reviewListResponse: ReviewListResponse = {
  statuses: ['Perlu Review', 'Sedang Direview', 'Butuh Bukti Tambahan', 'Ditandai Risiko', 'Clear / Tidak Prioritas', 'Selesai'],
  counts: {
    'Perlu Review': 1,
    'Sedang Direview': 0,
    'Butuh Bukti Tambahan': 0,
    'Ditandai Risiko': 0,
    'Clear / Tidak Prioritas': 0,
    Selesai: 0,
  },
  items: [reviewRecord],
  guardrail: demoState.guardrail,
};


const queueResponse: QueueResponse = {
  summary: { total: 1, risiko_tinggi: 1, risiko_sedang: 0, risiko_rendah: 0 },
  distribution: [{ label: 'Risiko Tinggi', count: 1 }],
  trend: [{ bucket: 'Rank-01', average_priority: 0.92, review_count: 1 }],
  items: [queueItem],
  matched_count: 1,
  inference_status: demoState.inference_status,
  guardrail: demoState.guardrail,
  demo_case_id: queueItem.case_id,
};

const datasetResponse: ArchiveBrowserResponse = {
  total_rows: 465184,
  matched_count: 465184,
  page: 1,
  page_size: 100,
  total_pages: 4652,
  archive_scope: 'all_local_prepared_data',
  heldout_rows: 93034,
  train_rows: 372150,
  risk_distribution: { Risiko_Tinggi: 1, Risiko_Sedang: 0, Risiko_Rendah: 0 },
  split_distribution: { train_data: 372150, test_data: 93034 },
  monthly_risk_trend: [{ month: '2024-10', tinggi: 1, sedang: 0, rendah: 0, total: 1, average_priority: 0.92 }],
  date_range: { start_month: '2024-10', end_month: '2024-10', valid_date_rows: 1, invalid_date_rows: 0 },
  columns: ['archive_rank', 'source_split', 'case_id', 'package_title', 'buyer', 'supplier', 'predicted_label', 'risk_priority_score'],
  items: [
    {
      ...queueItem,
      archive_id: 'test_data:10:ocds-a',
      archive_rank: 1,
      split_risk_rank: 1,
      source_split: 'test_data',
      is_heldout: true,
      eval_claim_scope: 'heldout_test_only',
      row_id: 10,
      ocid: 'ocds-a',
      tender_id: 'tender-a',
      category: 'Pekerjaan Konstruksi',
      status: 'active',
      date_published: '2024-10-12',
      buyer_region: 'Kabupaten X',
      buyer_region_type: 'kabupaten',
      buyer_region_source: 'derived_from_buyer_name',
      buyer_region_note: 'Derived from buyer_name display only.',
    },
  ],
  inference_status: {
    model_artifact: 'model_risk.ubj',
    model_backend: 'xgboost',
    inference_mode: 'offline_local',
    archive_scope: 'all_local_prepared_data',
    rows_scored: 465184,
    rows_ranked: 465184,
    rows_displayed: 100,
    matched_rows: 465184,
    queue_limit: 100,
    train_rows: 372150,
    heldout_rows: 93034,
    feature_sources: ['train_data/features.parquet', 'test_data/features.parquet'],
    raw_sources: ['train_data/raw.parquet', 'test_data/raw.parquet'],
    source_splits: ['train_data', 'test_data'],
    data_load_latency_ms: 100,
    model_load_latency_ms: 200,
    prediction_latency_ms: 300,
    queue_build_latency_ms: 400,
    total_latency_ms: 1000,
    generated_at: '2026-05-06T00:00:00Z',
    no_cloud_call: true,
    no_live_scraping: true,
    no_retraining: true,
    display_note: 'Full Archive includes local prepared rows; held-out proof stays test_data.',
    guardrail: demoState.guardrail,
  },
  display_note: 'Full Archive mencakup 465.184 paket tender lokal; bukti inferensi held-out tetap 93.034 baris test split.',
  guardrail: demoState.guardrail,
};

const archiveAnalyticsResponse: ArchiveAnalyticsResponse = {
  filters: { risk: 'all', split: 'all', search: '', buyer: '', supplier: '', sort: 'risk_desc' },
  counts: {
    total_rows: 465184,
    matched_count: 465184,
    train_rows: 372150,
    heldout_rows: 93034,
    risk_distribution: { Risiko_Tinggi: 32380, Risiko_Sedang: 281722, Risiko_Rendah: 151082 },
    split_distribution: { train_data: 372150, test_data: 93034 },
  },
  priority_map: [
    {
      archive_id: 'test_data:10:ocds-a',
      case_id: queueItem.case_id,
      source_split: 'test_data',
      is_heldout: true,
      eval_claim_scope: 'heldout_test_only',
      title: queueItem.package_title,
      buyer: queueItem.buyer,
      supplier: queueItem.supplier,
      region: 'Kabupaten X',
      risk_label: 'Risiko Tinggi',
      filter_value: 'Risiko Tinggi',
      risk_score: 0.92,
      probability_high: 0.92,
      contract_value: 87450000000,
      tender_value_display: queueItem.tender_value_display,
      filtered_rank: 201,
      archive_page: 3,
    },
  ],
  priority_map_meta: {
    point_limit: 500,
    points_returned: 1,
    matched_count: 465184,
    total_value_candidates: 1,
    is_capped: true,
    sample_strategy: 'balanced_120_per_risk_tier_plus_top_140_by_positive_contract_value',
    null_value_rows: 0,
    zero_value_rows: 0,
  },
  regional_concentration: [
    { label: 'Kota Bandung', count: 7, percent: 70, high_risk_count: 3, high_risk_percent: 42.8, total_contract_value: 87450000000, average_risk_score: 0.82, region: 'Kota Bandung', region_type: 'kota', region_source: 'derived_from_buyer_name', region_note: 'Derived from buyer_name display only.', buyer: null },
    { label: 'Provinsi Jawa Barat', count: 2, percent: 20, high_risk_count: 1, high_risk_percent: 50, total_contract_value: 1000, average_risk_score: 0.71, region: 'Provinsi Jawa Barat', region_type: 'provinsi', region_source: 'derived_from_buyer_name', region_note: 'Unsupported for kab/kota map.', buyer: null },
    { label: 'Unknown buyer region', count: 1, percent: 10, high_risk_count: 0, high_risk_percent: 0, total_contract_value: 0, average_risk_score: 0, region: 'Unknown buyer region', region_type: 'unknown', region_source: 'derived_from_buyer_name', region_note: 'Buyer name text did not produce a kab/kota match.', buyer: null },
    { label: 'Kabupaten Tidak Ada', count: 1, percent: 10, high_risk_count: 0, high_risk_percent: 0, total_contract_value: 100, average_risk_score: 0.2, region: 'Kabupaten Tidak Ada', region_type: 'kabupaten', region_source: 'derived_from_buyer_name', region_note: 'No local map match.', buyer: null },
  ],
  regional_meta: { limit: 12, returned: 4, matched_count: 465184, is_capped: false, sort: 'risk_desc', note: 'Buyer region is derived from buyer name text, not official geolocation.' },
  region_map: [
    {
      region_key: 'kota-bandung',
      map_key: 'kota-bandung',
      label: 'Kota Bandung',
      province: 'Jawa Barat',
      region_type: 'kota',
      status: 'matched',
      geo_match_status: 'matched',
      count: 7,
      percent: 70,
      high_risk_count: 3,
      high_risk_percent: 42.8,
      total_contract_value: 87450000000,
      average_risk_score: 0.82,
      region_source: 'derived_from_buyer_name',
      region_note: 'Derived from buyer name text only.',
      filter_value: 'kota-bandung',
    },
    {
      region_key: 'provinsi-jawa-barat',
      map_key: null,
      label: 'Provinsi Jawa Barat',
      province: null,
      region_type: 'provinsi',
      status: 'unsupported_level',
      geo_match_status: 'unsupported_level',
      count: 2,
      percent: 20,
      high_risk_count: 1,
      high_risk_percent: 50,
      total_contract_value: 1000,
      average_risk_score: 0.71,
      region_source: 'derived_from_buyer_name',
      region_note: 'Unsupported for kab/kota map.',
      filter_value: 'provinsi-jawa-barat',
    },
    {
      region_key: '',
      map_key: null,
      label: 'Unknown buyer region',
      province: null,
      region_type: 'unknown',
      status: 'unsupported_level',
      geo_match_status: 'unsupported_level',
      count: 1,
      percent: 10,
      high_risk_count: 0,
      high_risk_percent: 0,
      total_contract_value: 0,
      average_risk_score: 0,
      region_source: 'derived_from_buyer_name',
      region_note: 'Buyer name text did not produce a kab/kota match.',
      filter_value: '',
    },
    {
      region_key: 'kabupaten-tidak-ada',
      map_key: null,
      label: 'Kabupaten Tidak Ada',
      province: null,
      region_type: 'kabupaten',
      status: 'unmatched',
      geo_match_status: 'unmatched',
      count: 1,
      percent: 10,
      high_risk_count: 0,
      high_risk_percent: 0,
      total_contract_value: 100,
      average_risk_score: 0.2,
      region_source: 'derived_from_buyer_name',
      region_note: 'No local map match.',
      filter_value: 'kabupaten-tidak-ada',
    },
  ],
  region_map_meta: {
    asset_path: 'frontend/src/assets/maps/indonesia-kabupaten-kota.geojson',
    attribution_path: 'docs/indonesia-kabupaten-kota-geojson-attribution.md',
    source_url: 'https://github.com/ardian28/GeoJson-Indonesia-38-Provinsi',
    source_commit: '486e89ca57c9f9910991dbf00afca26297b3baa3',
    license: 'MIT',
    feature_count: 518,
    matched_count: 465184,
    regions_returned: 4,
    matched_regions: 1,
    mapped_regions: 1,
    unmatched_regions: 1,
    unsupported_regions: 2,
    unsupported_level_regions: 2,
    source_note: 'Buyer region is derived from buyer name text and joined to offline kabupaten/kota map keys only as a navigation aid.',
    geojson_source: 'https://github.com/ardian28/GeoJson-Indonesia-38-Provinsi',
    geojson_license: 'MIT',
    map_granularity: 'kabupaten_kota',
    note: 'Buyer region is derived from buyer name text, not official geolocation.',
  },
  buyer_concentration: [
    { label: queueItem.buyer, count: 1, percent: 100, high_risk_count: 1, high_risk_percent: 100, total_contract_value: 87450000000, average_risk_score: 0.92, region: null, region_type: null, region_source: null, region_note: null, buyer: queueItem.buyer },
  ],
  buyer_meta: { limit: 12, returned: 1, matched_count: 465184, is_capped: false, sort: 'risk_desc', note: 'Buyer concentration groups exact buyer names from prepared local archive rows.' },
  coverage_proof: {
    archive_scope: 'all_local_prepared_data',
    total_rows: 465184,
    matched_count: 465184,
    train_rows: 372150,
    heldout_rows: 93034,
    filtered_train_rows: 372150,
    filtered_heldout_rows: 93034,
    source_splits: ['train_data', 'test_data'],
    feature_sources: ['train_data/features.parquet', 'test_data/features.parquet'],
    raw_sources: ['train_data/raw.parquet', 'test_data/raw.parquet'],
    eval_claim_note: 'Held-out evaluation claims remain scoped to test_data; train_data rows are shown for archive browsing and triase risiko only.',
    archive_display_note: datasetResponse.display_note,
    no_cloud_call: true,
    no_live_scraping: true,
    no_retraining: true,
  },
  monthly_trends: [{ month: '2024-10', tinggi: 1, sedang: 0, rendah: 0, total: 1, average_priority: 0.92 }],
  donut: [
    { label: 'Risiko Tinggi', filter_value: 'Risiko Tinggi', count: 32380, percent: 6.96, color: '#E05A4F' },
    { label: 'Risiko Sedang', filter_value: 'Risiko Sedang', count: 281722, percent: 60.56, color: '#D8A42F' },
    { label: 'Risiko Rendah', filter_value: 'Risiko Rendah', count: 151082, percent: 32.48, color: '#4FA66A' },
  ],
  display_note: 'Archive analytics are bounded summaries over filtered local prepared data; charts support triase risiko and prioritas review, bukan tuduhan pelanggaran.',
  guardrail: demoState.guardrail,
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}



function installAppFetchMock() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/demo-state')) return jsonResponse(demoState);
    if (url.startsWith('/api/queue')) return jsonResponse(queueResponse);
    if (url.startsWith('/api/archive/analytics')) return jsonResponse(archiveAnalyticsResponse);
    if (url.startsWith('/api/archive')) return jsonResponse(datasetResponse);
    if (url.startsWith('/api/reviews/')) return jsonResponse(reviewRecord);
    if (url.startsWith('/api/reviews')) return jsonResponse(reviewListResponse);
    if (url.startsWith('/api/casebook/')) return jsonResponse(casebook);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

function renderAppAt(path: string) {
  window.history.pushState(null, '', path);
  const fetchMock = installAppFetchMock();
  const view = render(<App />);
  return { ...view, fetchMock };
}

const appSidebarLabels = ['Home', 'Dashboard', 'Review Desk', 'Reports', 'Settings', 'Help'] as const;
const dashboardTabLabels = ['Overview', 'Archive', 'Analytics', /Lokasi|Map Distribusi/i, 'Activity'] as const;

test('App sidebar opens as a drawer from the topbar and contains only app-level pages', async () => {
  const { fetchMock } = renderAppAt('/home');
  await screen.findByText(/AI for accountable procurement/i);

  const sidebar = document.querySelector('[aria-label="App sidebar navigation"]') as HTMLElement;
  expect(sidebar).toBeInTheDocument();
  expect(sidebar).toHaveAttribute('aria-expanded', 'false');
  expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
  expect(sidebar).toHaveAttribute('aria-expanded', 'true');
  expect(sidebar).toHaveAttribute('aria-hidden', 'false');

  for (const label of appSidebarLabels) {
    expect(within(sidebar).getByRole('link', { name: label })).toBeInTheDocument();
  }
  expect(within(sidebar).queryByText(/Offline audit/i)).not.toBeInTheDocument();
  expect(within(sidebar).queryByRole('link', { name: /^Archive$/i })).not.toBeInTheDocument();
  expect(within(sidebar).queryByRole('link', { name: /^Analytics$/i })).not.toBeInTheDocument();
  fireEvent.click(within(sidebar).getByRole('button', { name: 'Close sidebar drawer' }));
  expect(sidebar).toHaveAttribute('aria-expanded', 'false');
  expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  fetchMock.mockRestore();
});

test('Dashboard floating nav owns Archive and Analytics dashboard subpages', async () => {
  const routes: Array<{ path: string; current: string | RegExp; content: string | RegExp; absent?: Array<string | RegExp> }> = [
    { path: '/dashboard', current: 'Overview', content: 'Ringkasan risiko saat ini', absent: ['Tender Archive Explorer', 'Full Archive Risk Analytics'] },
    { path: '/dashboard/overview', current: 'Overview', content: 'Ringkasan risiko saat ini', absent: ['Tender Archive Explorer', 'Full Archive Risk Analytics'] },
    { path: '/command-center', current: 'Overview', content: 'Ringkasan risiko saat ini', absent: ['Tender Archive Explorer', 'Full Archive Risk Analytics'] },
    { path: '/dashboard/archive', current: 'Archive', content: 'Arsip tender lokal' },
    { path: '/dashboard/analytics', current: 'Analytics', content: 'Analitik risiko arsip' },
    { path: '/dashboard/locations', current: /Lokasi|Map Distribusi/i, content: 'Peta distribusi wilayah' },
    { path: '/dashboard/activity', current: 'Activity', content: 'Status operasi dashboard' },
  ];

  for (const route of routes) {
    const { fetchMock } = renderAppAt(route.path);
    await screen.findByText(route.content);
    const dashboardNav = screen.getByRole('navigation', { name: 'Dashboard sections' });
    expect(dashboardNav.querySelector('.dashboard-floating-nav__indicator')).toBeInTheDocument();
    for (const label of dashboardTabLabels) {
      expect(within(dashboardNav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    const activeLink = within(dashboardNav).getByRole('link', { name: route.current });
    const activeIndex = Array.from<HTMLElement>(dashboardNav.querySelectorAll('a')).indexOf(activeLink);
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(dashboardNav).toHaveClass(`dashboard-floating-nav--active-${activeIndex}`);
    for (const absent of route.absent ?? []) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
    fetchMock.mockRestore();
    cleanup();
  }
});

test('Review Desk is an app-level saved review worklist', async () => {
  const { fetchMock } = renderAppAt('/reviews');

  expect(await screen.findByRole('heading', { name: 'Review Desk' })).toBeInTheDocument();
  expect(screen.getByText('Hybrid human sign-off')).toBeInTheDocument();
  expect(screen.getAllByText('Perlu Review').length).toBeGreaterThan(0);
  expect(await screen.findByText(queueItem.package_title)).toBeInTheDocument();
  expect(screen.getByText('Draft from casebook')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open review drawer/i })).toHaveAttribute('href', `/casebook/${encodeURIComponent(queueItem.case_id)}?review=1`);

  fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
  expect(within(screen.getByRole('navigation', { name: 'App sidebar navigation' })).getByRole('link', { name: 'Review Desk' })).toHaveAttribute('href', '/reviews');
  fetchMock.mockRestore();
});

test('Casebook review drawer loads a draft and saves human sign-off', async () => {
  const savedReview = { ...reviewRecord, status: 'Ditandai Risiko', reviewer_name: 'Vasco Yudha', is_saved: true, signed_off_at: '2026-05-13T00:00:00+00:00', event_count: 1 };
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/demo-state')) return jsonResponse(demoState);
    if (url.startsWith('/api/queue')) return jsonResponse(queueResponse);
    if (url.startsWith('/api/archive/analytics')) return jsonResponse(archiveAnalyticsResponse);
    if (url.startsWith('/api/archive')) return jsonResponse(datasetResponse);
    if (url.startsWith('/api/reviews/') && init?.method === 'PUT') return jsonResponse(savedReview);
    if (url.startsWith('/api/reviews/')) return jsonResponse(reviewRecord);
    if (url.startsWith('/api/casebook/')) return jsonResponse(casebook);
    throw new Error(`Unexpected fetch ${url}`);
  });
  window.history.pushState(null, '', `/casebook/${encodeURIComponent(queueItem.case_id)}?review=1`);
  render(<App />);

  expect(await screen.findByRole('region', { name: 'Package review drawer' })).toBeInTheDocument();
  expect(screen.getByText('AI/model prefill')).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText('Reviewer name'), { target: { value: 'Vasco Yudha' } });
  fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'Ditandai Risiko' } });
  fireEvent.change(screen.getByLabelText('Reviewer notes'), { target: { value: 'Dokumen perlu diverifikasi.' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Sign off review/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Save review' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/reviews/${encodeURIComponent(queueItem.case_id)}`, expect.objectContaining({ method: 'PUT' })));
  expect(await screen.findByText(/Saved as Ditandai Risiko/i)).toBeInTheDocument();
  fetchMock.mockRestore();
});

test('Dashboard overview stays summary-only while Archive and Analytics own deep content', async () => {
  const overview = renderAppAt('/dashboard/overview');
  await screen.findByText('Ringkasan risiko saat ini');
  expect(document.querySelector('.overview-chart-grid')).toBeInTheDocument();
  expect(document.querySelector('.risk-distribution-card')).toBeInTheDocument();
  expect(document.querySelector('.risk-trend-card')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Peta Nusantara' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Peta Indonesia/i })).toBeInTheDocument();
  expect(screen.queryByText(/Tujuan:/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Ringkasan command-center untuk membaca kondisi triase risiko/i)).not.toBeInTheDocument();
  const auditorRail = screen.getByRole('region', { name: 'Auditor package tasks' });
  expect(within(auditorRail).getByText('Auditor queue')).toBeInTheDocument();
  expect(within(auditorRail).getByText('Most urgent')).toBeInTheDocument();
  expect(within(auditorRail).getByRole('link', { name: /Open casebook/i })).toHaveAttribute('href', '/casebook/10%3Aocds-a?demo=1');
  expect(screen.queryByText('Tender Archive Explorer')).not.toBeInTheDocument();
  expect(screen.queryByText('Full Archive Risk Analytics')).not.toBeInTheDocument();
  overview.fetchMock.mockRestore();
  cleanup();

  const archive = renderAppAt('/dashboard/archive');
  expect(await screen.findByText('Tender Archive Explorer')).toBeInTheDocument();
  expect(screen.getByText('Rows per page')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /Inference status/i })).not.toBeInTheDocument();
  expect(document.querySelector('.app-topbar')).not.toHaveTextContent('Inference');
  archive.fetchMock.mockRestore();
  cleanup();

  const analytics = renderAppAt('/dashboard/analytics');
  expect(await screen.findByText('Full Archive Risk Analytics')).toBeInTheDocument();
  expect(screen.getByText('Filtered archive')).toBeInTheDocument();
  expect(screen.queryByText('Tender Archive Explorer')).not.toBeInTheDocument();
  analytics.fetchMock.mockRestore();
  cleanup();
});

test('Analytics rail resolves high-risk mix across archive distribution key variants', async () => {
  const { fetchMock } = renderAppAt('/dashboard/analytics');

  const analyticsRail = await screen.findByRole('region', { name: 'Analytics framing' });
  expect(within(analyticsRail).getByText('Risk mix')).toBeInTheDocument();
  await waitFor(() => expect(within(analyticsRail).getByText('32.380')).toBeInTheDocument());

  fetchMock.mockRestore();
});

test('Archive analytics separates undetected regions from normal regional concentration rows', () => {
  const analyticsWithUnknownRegion: ArchiveAnalyticsResponse = {
    ...archiveAnalyticsResponse,
    regional_concentration: [
      { label: 'Tidak tersedia', count: 11451, percent: 20, high_risk_count: 11451, high_risk_percent: 100, total_contract_value: 0, average_risk_score: 0.8, region: 'Tidak tersedia', region_type: 'unknown', region_source: 'derived_from_buyer_name', region_note: 'Buyer name text did not produce a kab/kota match.', buyer: null },
      { label: 'Kabupaten Tuban', count: 900, percent: 10, high_risk_count: 541, high_risk_percent: 60, total_contract_value: 1800000000000, average_risk_score: 0.72, region: 'Kabupaten Tuban', region_type: 'kabupaten', region_source: 'derived_from_buyer_name', region_note: 'Derived from buyer_name display only.', buyer: null },
    ],
  };

  render(<ArchiveAnalyticsPanel analytics={analyticsWithUnknownRegion} activeRisk="all" onRiskFilter={() => undefined} onSelectPoint={() => undefined} />);

  const regionalPanel = screen.getByRole('tabpanel', { name: 'Regional Risk Concentration' });
  expect(within(regionalPanel).getByText('Kabupaten Tuban')).toBeInTheDocument();
  expect(within(regionalPanel).getByText('Tidak terklasifikasi')).toBeInTheDocument();
  expect(within(regionalPanel).getByText(/Tidak terdeteksi dari nama buyer/i)).toBeInTheDocument();
  expect(within(regionalPanel).queryByText('Tidak tersedia')).not.toBeInTheDocument();
});

test('Archive analytics renders one risk composition section and Top Patterns summary', () => {
  render(<ArchiveAnalyticsPanel analytics={archiveAnalyticsResponse} activeRisk="all" onRiskFilter={() => undefined} onSelectPoint={() => undefined} />);

  expect(screen.getAllByText('Komposisi Risiko')).toHaveLength(1);
  const summary = screen.getByRole('region', { name: 'Top Patterns' });
  expect(within(summary).getByText('Matched archive rows')).toBeInTheDocument();
  expect(within(summary).getByText('465.184')).toBeInTheDocument();
  expect(within(summary).getByText('High-risk count/share')).toBeInTheDocument();
  expect(within(summary).getByText(/32\.380.*7/i)).toBeInTheDocument();
  expect(within(summary).getByText('Top classified region')).toBeInTheDocument();
  expect(within(summary).getByText('Kota Bandung')).toBeInTheDocument();
  expect(within(summary).getByText('Top buyer group')).toBeInTheDocument();
  expect(within(summary).getByText(queueItem.buyer)).toBeInTheDocument();
  expect(within(summary).getByText('Priority sample count')).toBeInTheDocument();
  expect(within(summary).getByText('1 dari 500')).toBeInTheDocument();
});

test('Archive analytics priority shortcuts reveal selected point details and notify parent', () => {
  const onSelectPoint = vi.fn();
  render(<ArchiveAnalyticsPanel analytics={archiveAnalyticsResponse} activeRisk="all" onRiskFilter={() => undefined} onSelectPoint={onSelectPoint} />);

  fireEvent.click(screen.getByRole('button', { name: /archive page 3/i }));

  const detail = screen.getByRole('region', { name: 'Selected priority point detail' });
  expect(detail).toBeInTheDocument();
  expect(within(detail).getByText(queueItem.package_title)).toBeInTheDocument();
  expect(within(detail).getByText(queueItem.buyer)).toBeInTheDocument();
  expect(within(detail).getByText(queueItem.supplier)).toBeInTheDocument();
  expect(within(detail).getByText('Kabupaten X')).toBeInTheDocument();
  expect(within(detail).getByText('Risiko Tinggi')).toBeInTheDocument();
  expect(within(detail).getByText('0.920')).toBeInTheDocument();
  expect(within(detail).getByText(queueItem.tender_value_display)).toBeInTheDocument();
  expect(within(detail).getByText('3')).toBeInTheDocument();
  expect(within(detail).getByRole('button', { name: /Open archive row/i })).toBeInTheDocument();
  expect(onSelectPoint).toHaveBeenCalledWith(archiveAnalyticsResponse.priority_map[0]);
});

