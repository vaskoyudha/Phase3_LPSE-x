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

test('Archive analytics matrix explains sampled dots and log value axis', () => {
  render(<ArchiveAnalyticsPanel analytics={archiveAnalyticsResponse} activeRisk="all" onRiskFilter={() => undefined} onSelectPoint={() => undefined} />);

  expect(screen.getByText(/X = risk tier/i)).toBeInTheDocument();
  expect(screen.getByText(/Y = contract value on log scale/i)).toBeInTheDocument();
  expect(screen.getByText(/scatter dots are sampled/i)).toBeInTheDocument();
  expect(screen.getByText(/distribution strip is the true mix/i)).toBeInTheDocument();
});

test('Dashboard filter panel toggles from the topbar without old status pills', async () => {
  const { fetchMock } = renderAppAt('/dashboard/overview');
  await screen.findByText('Ringkasan risiko saat ini');

  const topbar = document.querySelector('.app-topbar') as HTMLElement;
  expect(topbar).toBeInTheDocument();
  expect(within(topbar).queryByText('Offline')).not.toBeInTheDocument();
  expect(within(topbar).queryByText('Single Model')).not.toBeInTheDocument();
  expect(within(topbar).queryByText('Auditor')).not.toBeInTheDocument();
  expect(screen.queryByText('Risk level')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /Inference status/i })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /Selected use case/i })).toBeInTheDocument();

  const panelsButton = within(topbar).getByRole('button', { name: /Panels 1 of 1 visible/i });
  expect(panelsButton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(panelsButton);
  expect(panelsButton).toHaveAttribute('aria-expanded', 'true');

  const panelsMenu = screen.getByRole('group', { name: 'Dashboard panels' });
  expect(within(panelsMenu).queryByRole('button', { name: /inference/i })).not.toBeInTheDocument();

  const useCaseButton = within(panelsMenu).getByRole('button', { name: 'Hide use case' });
  expect(useCaseButton).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(useCaseButton);
  expect(within(panelsMenu).getByRole('button', { name: 'Show use case' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('region', { name: /Selected use case/i })).not.toBeInTheDocument();
  expect(within(topbar).getByRole('button', { name: /Panels 0 of 1 visible/i })).toBeInTheDocument();

  const filterButton = within(topbar).getByRole('button', { name: 'Filters' });
  expect(filterButton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(filterButton);
  expect(within(topbar).getByRole('button', { name: 'Hide filters' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Risk level')).toBeInTheDocument();

  fireEvent.click(within(topbar).getByRole('button', { name: 'Hide filters' }));
  expect(screen.queryByText('Risk level')).not.toBeInTheDocument();
  fetchMock.mockRestore();
});

test('Unknown frontend route renders NotFound with real recovery routes', async () => {
  const fetchMock = installAppFetchMock();
  window.history.pushState(null, '', '/unknown-route');
  render(<App />);
  expect((await screen.findAllByText('Halaman tidak ditemukan')).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /Home/i }).some((link) => link.getAttribute('href') === '/home')).toBe(true);
  expect(screen.getAllByRole('link', { name: /Dashboard/i }).some((link) => link.getAttribute('href') === '/dashboard/overview')).toBe(true);
  fetchMock.mockRestore();
});

test('LandingPage renders reference-style CTAs and required safe copy', () => {
  render(<LandingPage demoState={demoState} onOpen={() => undefined} />);
  expect(screen.getByText('Open Command Center')).toBeInTheDocument();
  expect(screen.getByText('View Casebook Demo')).toBeInTheDocument();
  expect(screen.getByText(/SHAP Explainability/)).toBeInTheDocument();
  expect(screen.getAllByText(/triase risiko/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/prioritas review/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/bukan tuduhan pelanggaran/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Human review guardrail: triase risiko · prioritas review · bukan tuduhan pelanggaran/i)).toBeInTheDocument();
});

test('FilterRail updates risk filters with compact controls only', () => {
  let filters: Filters = { search: '', risk: 'all', topN: '50', buyer: '', supplier: '' };
  const { rerender } = render(<FilterRail filters={filters} setFilters={(next) => { filters = next; }} reset={() => { filters = { search: '', risk: 'all', topN: '50', buyer: '', supplier: '' }; }} buyers={[queueItem.buyer]} suppliers={[queueItem.supplier]} resultCount={1} />);
  fireEvent.click(screen.getByLabelText('Risiko Tinggi'));
  rerender(<FilterRail filters={filters} setFilters={(next) => { filters = next; }} reset={() => undefined} buyers={[queueItem.buyer]} suppliers={[queueItem.supplier]} resultCount={1} />);
  expect(filters.risk).toBe('Risiko Tinggi');
  expect(screen.getByText('Filters')).toBeInTheDocument();
  expect(screen.getByText('1 matched')).toBeInTheDocument();
  expect(screen.queryByText(/Dataset scope/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/triase risiko/)).not.toBeInTheDocument();
  expect(screen.queryByText(/bukan tuduhan pelanggaran/)).not.toBeInTheDocument();
});

test('KpiCards prefer full archive database counts over visible Top-N queue counts', () => {
  render(<KpiCards queue={queueResponse} archiveCounts={archiveAnalyticsResponse.counts} />);

  expect(within(screen.getByRole('region', { name: 'Total Packages KPI' })).getByText('465.184')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Risiko Tinggi KPI' })).getByText('32.380')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Risiko Sedang KPI' })).getByText('281.722')).toBeInTheDocument();
  expect(screen.queryByText(/database terfilter/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/dari database/i)).not.toBeInTheDocument();
});

test('RiskDistributionChart prefers actual filtered archive counts over visible queue counts', () => {
  render(<RiskDistributionChart queue={queueResponse} archiveCounts={archiveAnalyticsResponse.counts} />);

  const chart = screen.getByRole('region', { name: 'Distribusi Risiko' });
  expect(within(chart).getByText('database terfilter')).toBeInTheDocument();
  expect(within(chart).getByText('32.380 paket')).toBeInTheDocument();
  expect(within(chart).getByText('281.722 paket')).toBeInTheDocument();
  expect(within(chart).getByText('151.082 paket')).toBeInTheDocument();
  expect(within(chart).queryByText('1 paket')).not.toBeInTheDocument();
});


test('CommandCenterPage requests the full archive with page_size=100 and no stale test split copy', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/archive/analytics')) return jsonResponse(archiveAnalyticsResponse);
    if (url.startsWith('/api/archive')) return jsonResponse(datasetResponse);
    if (url.startsWith('/api/casebook/')) return jsonResponse(casebook);
    throw new Error(`Unexpected fetch ${url}`);
  });

  render(<CommandCenterPage demoState={demoState} queue={queueResponse} selectedId={queueItem.case_id} activeTab="analytics" onSelect={() => undefined} onOpenCasebook={() => undefined} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/archive\?/)));
  const archiveUrl = fetchMock.mock.calls.map(([input]) => String(input)).find((url) => url.startsWith('/api/archive?'));
  expect(archiveUrl).toBeTruthy();
  expect(new URLSearchParams(archiveUrl!.split('?')[1]).get('page_size')).toBe('100');
  expect(new URLSearchParams(archiveUrl!.split('?')[1]).get('sort')).toBe('risk_desc');
  expect(fetchMock.mock.calls.map(([input]) => String(input)).some((url) => url.startsWith('/api/archive/analytics?') && new URLSearchParams(url.split('?')[1]).get('sort') === 'risk_desc')).toBe(true);
  expect(await screen.findByText('Full Archive Risk Analytics')).toBeInTheDocument();
  expect(screen.getByText('Risk Tier × Contract Value Matrix')).toBeInTheDocument();
  expect(screen.getByText(/distribusi asli dibaca dari bar komposisi sebelum scatter/i)).toBeInTheDocument();
  expect(screen.getByText('True filtered archive mix')).toBeInTheDocument();
  expect(screen.getByText(/matrix uses balanced sample, not proportional dots/i)).toBeInTheDocument();
  expect(screen.getByText(/Balanced sample hanya untuk visibilitas scatter/i)).toBeInTheDocument();
  expect(screen.getByText('Regional Risk Concentration')).toBeInTheDocument();
  expect(screen.getByText('Top Buyer Risk Concentration')).toBeInTheDocument();
  expect(screen.queryByText(/test_data split/i)).not.toBeInTheDocument();
});

test('SelectedCasePreview renders selected score and top three casebook factors', () => {
  const openLocation = vi.fn();
  const { rerender } = render(<SelectedCasePreview item={queueItem} casebook={casebook} onOpen={() => undefined} onOpenLocation={openLocation} />);
  expect(screen.queryByText('Selected case')).not.toBeInTheDocument();
  expect(screen.queryByText('ID Paket')).not.toBeInTheDocument();
  expect(screen.queryByText('Split')).not.toBeInTheDocument();
  expect(screen.getAllByText('Buyer-supplier repeat relationship').length).toBeGreaterThan(0);
  expect(screen.getByText('Description completeness')).toBeInTheDocument();
  expect(screen.getByText('Kabupaten X')).toBeInTheDocument();
  expect(screen.getByText(/bukan pin alamat jalan/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open OSM search/i })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org/search'));

  fireEvent.click(screen.getByRole('button', { name: /Show on map/i }));
  expect(openLocation).toHaveBeenCalledWith('kabupaten-x');

  rerender(<SelectedCasePreview item={{ ...queueItem, buyer_region: 'Kota Bandung', buyer_region_type: 'kota', buyer_region_key: 'kota-bandung' }} casebook={casebook} onOpen={() => undefined} onOpenLocation={openLocation} />);
  expect(screen.getByTitle(/Approximate street map preview for Kota Bandung/i)).toHaveAttribute('src', expect.stringContaining('openstreetmap.org/export/embed.html'));
  expect(screen.getByTitle(/Approximate street map preview for Kota Bandung/i)).toHaveAttribute('src', expect.stringContaining('marker='));
  expect(screen.getByRole('link', { name: /-6\./i })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org/?mlat='));
});


test('SelectedCasePreview opens Casebook for held-out rows and Archive Details for train archive rows', () => {
  const open = vi.fn();
  const { rerender } = render(<SelectedCasePreview item={{ ...queueItem, source_split: 'test_data', is_heldout: true }} casebook={casebook} onOpen={open} />);
  expect(screen.getByRole('button', { name: /Open Casebook/i })).toBeEnabled();

  rerender(<SelectedCasePreview item={{ ...queueItem, case_id: 'train_data:10:ocds-a', source_split: 'train_data', is_heldout: false, archive_rank: 7 } as QueueItem} casebook={null} onOpen={open} />);
  expect(screen.getByRole('button', { name: /Archive Details/i })).toBeEnabled();
});

test('InferenceStatusCard keeps local scoring status compact', () => {
  render(<InferenceStatusCard status={demoState.inference_status} />);
  expect(screen.getByText('Inference')).toBeInTheDocument();
  expect(screen.queryByText('Live scoring')).not.toBeInTheDocument();
  expect(screen.getByText('Ready')).toBeInTheDocument();
  expect(screen.getByText('93.034')).toBeInTheDocument();
  expect(screen.getByText('Top 50')).toBeInTheDocument();
  expect(screen.queryByText(/Why only Top 50/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No cloud call/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No retraining/)).not.toBeInTheDocument();
});

test('RiskQueueTable keeps command-center cockpit compact with top-25 pages', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    ...queueItem,
    case_id: `${index + 1}:ocds-a`,
    risk_rank: index + 1,
    package_title: `Paket Prioritas ${String(index + 1).padStart(2, '0')}`,
    predicted_label: index < 3 ? 'Risiko Tinggi' : 'Risiko Sedang',
  }));
  render(<RiskQueueTable items={items} selectedId={items[0].case_id} onSelect={() => undefined} />);

  expect(screen.getByText('Paket Prioritas 12')).toBeInTheDocument();
  expect(screen.queryByText('Paket Prioritas 13')).not.toBeInTheDocument();
  expect(screen.getByText(/Menampilkan 1–12 dari 12 paket antrean lokal/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '›' })).toBeDisabled();
});


test('CommandCenterPage requests archive pages at the 100-row contract size without refetching analytics on pagination', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.startsWith('/api/archive/analytics')) {
      return Promise.resolve(new Response(JSON.stringify(archiveAnalyticsResponse), { status: 200 }));
    }
    if (url.startsWith('/api/archive')) {
      return Promise.resolve(new Response(JSON.stringify(datasetResponse), { status: 200 }));
    }
    if (url.startsWith('/api/casebook/')) {
      return Promise.resolve(new Response(JSON.stringify(casebook), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });

  render(<CommandCenterPage demoState={demoState} queue={queueResponse} selectedId={queueItem.case_id} activeTab="archive" onSelect={() => undefined} onOpenCasebook={() => undefined} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/archive?page=1&page_size=100&sort=risk_desc'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/archive/analytics?sort=risk_desc'));
  const analyticsCallsBefore = fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/archive/analytics')).length;
  fireEvent.click(screen.getByLabelText('Next archive page'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/archive?page=2&page_size=100&sort=risk_desc'));
  const analyticsCallsAfter = fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/archive/analytics')).length;
  expect(analyticsCallsAfter).toBe(analyticsCallsBefore);
  fetchMock.mockRestore();
});

test('Archive analytics risk composition filters risk and priority map jumps to the target archive page', async () => {
  const onSelect = vi.fn();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/archive/analytics')) return jsonResponse(archiveAnalyticsResponse);
    if (url.startsWith('/api/archive')) return jsonResponse(datasetResponse);
    if (url.startsWith('/api/casebook/')) return jsonResponse(casebook);
    throw new Error(`Unexpected fetch ${url}`);
  });

  render(<CommandCenterPage demoState={demoState} queue={queueResponse} selectedId={queueItem.case_id} activeTab="analytics" onSelect={onSelect} onOpenCasebook={() => undefined} />);

  await screen.findByText('Komposisi Risiko');
  fireEvent.click(await screen.findByLabelText('Filter Risiko Tinggi'));
  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
    const url = String(input);
    return url.startsWith('/api/archive/analytics?') && new URLSearchParams(url.split('?')[1]).get('risk') === 'Risiko Tinggi';
  })).toBe(true));

  fireEvent.click(screen.getByRole('button', { name: /archive page 3/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/archive?page=3&page_size=100&risk=Risiko+Tinggi&sort=risk_desc'));
  expect(onSelect).toHaveBeenCalledWith(queueItem.case_id);
});



test('LokasiMap renders open-source map copy, SVG backup paths, unsupported panel, and emits region_key selection', () => {
  const selectRegion = vi.fn();
  const { container } = render(<LokasiMap analytics={archiveAnalyticsResponse} selectedRegionKey="" onSelectRegion={selectRegion} />);
  expect(screen.getByText('Open-source Indonesia risk map')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Local Indonesia kabupaten kota SVG backup map/i })).toBeInTheDocument();
  expect(screen.getByText('Unsupported levels')).toBeInTheDocument();
  expect(screen.getByText('Provinsi Jawa Barat')).toBeInTheDocument();
  expect(screen.getByText('Unmatched kab/kota')).toBeInTheDocument();
  expect(screen.getByText('Kabupaten Tidak Ada')).toBeInTheDocument();

  const bandungPath = container.querySelector<SVGPathElement>('svg path[data-region-key="kota-bandung"]');
  const bandungBubble = container.querySelector<SVGCircleElement>('svg circle[data-region-key="kota-bandung"]');
  expect(bandungPath).not.toBeNull();
  expect(bandungBubble).not.toBeNull();
  fireEvent.click(bandungPath!);
  expect(selectRegion).toHaveBeenCalledWith('kota-bandung');
});


test('LokasiMap clears selected region from empty SVG map areas', () => {
  const selectRegion = vi.fn();
  const { container } = render(<LokasiMap analytics={archiveAnalyticsResponse} selectedRegionKey="kota-bandung" onSelectRegion={selectRegion} />);
  const background = container.querySelector<SVGRectElement>('svg .lokasi-map__background');
  const emptyRegion = Array.from(container.querySelectorAll<SVGPathElement>('svg path[data-region-key]')).find((path) => path.dataset.regionKey !== 'kota-bandung');

  expect(background).not.toBeNull();
  expect(emptyRegion).toBeDefined();
  fireEvent.click(background!);
  fireEvent.click(emptyRegion!);

  expect(selectRegion).toHaveBeenCalledWith('');
  expect(selectRegion).toHaveBeenCalledTimes(2);
});

test('Lokasi dashboard click adds region_key to archive and analytics requests', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/archive/analytics')) return jsonResponse(archiveAnalyticsResponse);
    if (url.startsWith('/api/archive')) return jsonResponse(datasetResponse);
    if (url.startsWith('/api/casebook/')) return jsonResponse(casebook);
    throw new Error(`Unexpected fetch ${url}`);
  });

  const { container } = render(<CommandCenterPage demoState={demoState} queue={queueResponse} selectedId={queueItem.case_id} activeTab="locations" onSelect={() => undefined} onOpenCasebook={() => undefined} />);
  await screen.findByText('Open-source Indonesia risk map');
  const bandungPath = container.querySelector<SVGPathElement>('svg path[data-region-key="kota-bandung"]');
  expect(bandungPath).not.toBeNull();
  fireEvent.click(bandungPath!);

  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
    const url = String(input);
    return url.startsWith('/api/archive?') && new URLSearchParams(url.split('?')[1]).get('region_key') === 'kota-bandung';
  })).toBe(true));
  expect(fetchMock.mock.calls.some(([input]) => {
    const url = String(input);
    return url.startsWith('/api/archive/analytics?') && new URLSearchParams(url.split('?')[1]).get('region_key') === 'kota-bandung';
  })).toBe(true);
}, 15000);

test('chart panels show animated loading states while archive data is pending', () => {
  const archivePanel = render(<ArchiveAnalyticsPanel analytics={null} loading activeRisk="all" onRiskFilter={() => undefined} onSelectPoint={() => undefined} />);
  expect(screen.getByRole('status', { name: 'Loading priority matrix' })).toHaveClass('chart-loader--matrix');
  expect(screen.getByRole('status', { name: 'Loading risk mix' })).toHaveClass('chart-loader--donut');
  expect(screen.getByRole('status', { name: 'Loading regions' })).toHaveClass('chart-loader--list');
  archivePanel.unmount();

  render(<RiskTrendChart trend={[]} loading />);
  expect(screen.getByRole('status', { name: 'Loading monthly trend' })).toHaveClass('chart-loader--bars');
});

test('RiskTrendChart renders archive trend data without crashing the dashboard', async () => {
  render(<RiskTrendChart trend={[{ month: '2024-10', tinggi: 3, sedang: 2, rendah: 1, total: 6, average_priority: 0.76 }]} />);
  expect(screen.getByText('Tren Risiko Arsip per Bulan')).toBeInTheDocument();
  expect(screen.getByText('Peak 6 paket')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Fallback tren risiko arsip per bulan')).toBeInTheDocument());
});

test('ScoredDatasetExplorer shows the full archive is connected to visible model risk output', () => {
  let selected = '';
  render(<ScoredDatasetExplorer dataset={datasetResponse} selectedId="" onSelect={(row) => { selected = row.case_id; }} onPageChange={() => undefined} />);
  expect(screen.getByText('Tender Archive Explorer')).toBeInTheDocument();
  expect(screen.getAllByText('465.184').length).toBeGreaterThan(0);
  expect(screen.getAllByText('93.034').length).toBeGreaterThan(0);
  expect(screen.getAllByText('372.150').length).toBeGreaterThan(0);
  expect(screen.getByText('model_risk.ubj')).toBeInTheDocument();
  expect(screen.getAllByText('Pembangunan Jalan Lingkar Selatan Kab. X').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Risiko Tinggi').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Held-out').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Kabupaten X').length).toBeGreaterThan(0);
  expect(screen.getByText(/triase risiko · prioritas review · bukan tuduhan pelanggaran/)).toBeInTheDocument();
  expect(screen.getByText(/Triase risiko untuk prioritas review; bukan tuduhan pelanggaran/i)).toBeInTheDocument();

  fireEvent.click(screen.getAllByText('Pembangunan Jalan Lingkar Selatan Kab. X')[0]);
  expect(selected).toBe(queueItem.case_id);
});

test('ShapFactorBars renders signed zero-axis contributions', () => {
  render(<ShapFactorBars factors={casebook.factors} />);
  expect(screen.getByText('Mengapa paket ini diprioritaskan untuk review')).toBeInTheDocument();
  expect(screen.getAllByLabelText('zero-axis signed contribution')).toHaveLength(casebook.factors.length);
  expect(screen.getByText('← Menurunkan Prioritas Review')).toBeInTheDocument();
  expect(screen.getByText('Meningkatkan Prioritas Review →')).toBeInTheDocument();
});

test('CasebookPage renders dossier layout, reviewer questions, export, and safe reminder', () => {
  render(<CasebookPage casebook={casebook} exportUrl="/api/casebook/10%3Aocds-a/export.html" onBack={() => undefined} />);
  expect(screen.getByText('Explainable Casebook')).toBeInTheDocument();
  expect(screen.getByText('Tender hub')).toBeInTheDocument();
  expect(screen.getByText('Context')).toBeInTheDocument();
  expect(screen.getByText('Signal')).toBeInTheDocument();
  expect(screen.getByText('Verify')).toBeInTheDocument();
  expect(screen.getByText('Package details')).toBeInTheDocument();
  expect(screen.getByText('Risk summary')).toBeInTheDocument();
  expect(screen.getAllByText('Pembangunan Jalan Lingkar Selatan Kab. X').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Risiko Tinggi').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Held-out').length).toBeGreaterThan(0);
  expect(screen.getByText('Why this case is prioritized')).toBeInTheDocument();
  expect(screen.getByText('Signals to verify')).toBeInTheDocument();
  expect(screen.getByText('Apa arti SHAP?')).toBeInTheDocument();
  expect(screen.getAllByText(/Checklist:/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Tinjau daftar paket sebelumnya/i).length).toBeGreaterThan(0);
  expect(screen.getByText('Export Casebook')).toHaveAttribute('href', '/api/casebook/10%3Aocds-a/export.html');
  expect(screen.getByText(/triase risiko, prioritas review, bukan tuduhan pelanggaran/i)).toBeInTheDocument();
});

test('CasebookPage keeps the casebook background static', () => {
  const { container } = render(<CasebookPage casebook={casebook} exportUrl="/api/casebook/10%3Aocds-a/export.html" onBack={() => undefined} />);
  expect(container.querySelector('.casebook-grid')).toBeInTheDocument();
  expect(container.querySelector('.casebook-flow-lines')).not.toBeInTheDocument();
});

test('ModelTransparencyPage renders casebook-derived transparency and guardrails', () => {
  render(<ModelTransparencyPage initialCasebook={casebook} initialDemoState={demoState} />);
  expect(screen.getByText('Model Transparency')).toBeInTheDocument();
  expect(screen.getByText('Top Risk Drivers')).toBeInTheDocument();
  expect(screen.getByText('Prediction Summary')).toBeInTheDocument();
  expect(screen.getAllByText('92%').length).toBeGreaterThan(0);
  expect(screen.getByText('Bukan tuduhan pelanggaran')).toBeInTheDocument();
  expect(screen.getByText(/triase risiko dan prioritas review, bukan tuduhan pelanggaran/i)).toBeInTheDocument();
});
