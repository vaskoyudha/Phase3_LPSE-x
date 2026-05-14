import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Archive, ArrowSquareOut, ChartBar, CheckCircle, ClockCountdown, Database, Funnel, MapPinArea, MapTrifold, Pulse, Question, ShieldCheck, SquaresFour, Stack, UserCircle, WarningCircle, type Icon } from '@phosphor-icons/react';
import { api } from '../api/client';
import type { ArchiveAnalyticsResponse, ArchiveBrowserResponse, ArchivePriorityPoint, ArchiveRow, CasebookPayload, DemoState, InferenceStatus, QueueItem, QueueResponse } from '../types/api';
import { FilterRail, type Filters } from '../components/dashboard/FilterRail';
import { KpiCards } from '../components/dashboard/KpiCards';
import { RiskDistributionChart } from '../components/dashboard/RiskDistributionChart';
import { RiskTrendChart } from '../components/dashboard/RiskTrendChart';
import { RiskQueueTable } from '../components/dashboard/RiskQueueTable';
import { SelectedCasePreview } from '../components/dashboard/SelectedCasePreview';
import { InferenceStatusCard } from '../components/dashboard/InferenceStatusCard';
import { ScoredDatasetExplorer } from '../components/dashboard/ScoredDatasetExplorer';
import { ArchiveAnalyticsPanel } from '../components/dashboard/ArchiveAnalyticsPanel';
import { LokasiMap } from '../components/dashboard/LokasiMap';
import { NusantaraAtlasCarousel } from '../components/dashboard/NusantaraAtlasCarousel';

const defaultFilters: Filters = { search: '', risk: 'all', topN: '50', buyer: '', supplier: '' };
type DashboardQueryState = { filters: Filters; datasetPage: number; archiveSplit: string; archiveSort: string; selectedRegionKey: string };

function dashboardQueryState(): DashboardQueryState {
  if (typeof window === 'undefined') return { filters: defaultFilters, datasetPage: 1, archiveSplit: 'all', archiveSort: 'risk_desc', selectedRegionKey: '' };
  const query = new URLSearchParams(window.location.search);
  const page = Number.parseInt(query.get('page') ?? '1', 10);
  return {
    filters: {
      ...defaultFilters,
      risk: query.get('risk') || defaultFilters.risk,
      buyer: query.get('buyer') || '',
      supplier: query.get('supplier') || '',
      search: query.get('search') || '',
    },
    datasetPage: Number.isFinite(page) && page > 0 ? page : 1,
    archiveSplit: query.get('split') || 'all',
    archiveSort: query.get('sort') || 'risk_desc',
    selectedRegionKey: query.get('region_key') || '',
  };
}
const INFERENCE_PANEL_ID = 'dashboard-inference-panel';
const SELECTED_CASE_PANEL_ID = 'dashboard-selected-case-panel';
const RIGHT_RAIL_STICKY_TOP = 104;
const RIGHT_RAIL_STICKY_BOTTOM = 0;
const ARCHIVE_PAGE_SIZE = 100;
const PROFILE_NAME = 'Vasco Yudha';
const PROFILE_ROLE = 'LPSE-X Risk Analyst';
export type DashboardTab = 'overview' | 'archive' | 'analytics' | 'locations' | 'activity';

type DashboardTabDefinition = {
  key: DashboardTab;
  label: string;
  href: string;
  icon: Icon;
  title: string;
  description: string;
  operatorHint: string;
  filterTitle: string;
  filterDescription: string;
  primaryPanels: string[];
  excludedPanels: string[];
  sharedRails: string[];
  stateCoverage: string[];
  copyTone: string;
};

const dashboardTabMatrix: Record<DashboardTab, DashboardTabDefinition> = {
  overview: {
    key: 'overview',
    label: 'Overview',
    href: '/dashboard/overview',
    icon: SquaresFour,
    title: 'Ringkasan risiko saat ini',
    description: 'Baca kondisi triase risiko yang sedang difilter: volume paket, komposisi level risiko, tren ringkas, dan antrean prioritas review tanpa membuka arsip penuh.',
    operatorHint: 'Mulai dari antrean prioritas, pilih satu paket, lalu buka Casebook atau pindah ke Archive/Analytics bila perlu bukti baris dan pola agregat.',
    filterTitle: 'Filter ringkasan',
    filterDescription: 'Mempersempit KPI, grafik ringkas, dan antrean prioritas.',
    primaryPanels: ['KPI risiko', 'grafik ringkas distribusi/tren', 'antrean prioritas review', 'preview kasus terpilih', 'status inferensi'],
    excludedPanels: ['Tender Archive Explorer penuh', 'Full Archive Risk Analytics penuh'],
    sharedRails: ['filter risiko/buyer/supplier', 'status inferensi', 'preview kasus terpilih'],
    stateCoverage: ['loading grafik ringkas', 'antrean kosong setelah filter', 'status inferensi lokal'],
    copyTone: 'Bahasa Indonesia ringkas, eksekutif, audit-safe: triase risiko, prioritas review, bukan tuduhan pelanggaran.',
  },
  archive: {
    key: 'archive',
    label: 'Archive',
    href: '/dashboard/archive',
    icon: Archive,
    title: 'Arsip tender lokal',
    description: 'Telusuri seluruh baris train_data dan held-out test_data yang sudah discore lokal, lengkap dengan split provenance, sortir risiko, pagination, dan detail paket.',
    operatorHint: 'Gunakan filter, split, dan sort untuk menemukan baris yang perlu dicek; baris arsip tetap untuk prioritas review, bukan klaim pelanggaran.',
    filterTitle: 'Filter arsip',
    filterDescription: 'Mempersempit browser arsip, split, pagination, dan detail baris.',
    primaryPanels: ['Tender Archive Explorer', 'detail baris arsip', 'split/sort controls', 'filter arsip'],
    excludedPanels: ['antrean overview sebagai panel utama', 'grafik analytics penuh yang menggeser fokus tabel'],
    sharedRails: ['filter risiko/buyer/supplier', 'status inferensi', 'preview kasus/arsip terpilih'],
    stateCoverage: ['loading halaman arsip', 'error API arsip', 'arsip kosong setelah filter', 'detail baris terpilih'],
    copyTone: 'Bahasa Indonesia operasional untuk penelusuran data lokal, tetap menegaskan batas klaim evaluasi.',
  },
  analytics: {
    key: 'analytics',
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: ChartBar,
    title: 'Analitik risiko arsip',
    description: 'Lihat ringkasan agregat atas arsip lokal: risk mix, tren bulanan, konsentrasi buyer/wilayah, dan titik prioritas yang bisa diarahkan ke detail arsip.',
    operatorHint: 'Klik segmen risiko atau titik prioritas untuk mempersempit filter dan membawa konteks ke baris arsip yang relevan.',
    filterTitle: 'Filter analitik',
    filterDescription: 'Mempersempit risk mix, tren, concentration, dan priority map.',
    primaryPanels: ['Full Archive Risk Analytics', 'risk mix', 'tren bulanan', 'konsentrasi buyer/wilayah', 'priority map'],
    excludedPanels: ['Tender Archive Explorer penuh', 'antrean top-N overview sebagai panel utama'],
    sharedRails: ['filter risiko/buyer/supplier', 'status inferensi', 'preview titik prioritas terpilih'],
    stateCoverage: ['loading analytics', 'error API analytics', 'hasil agregat kosong setelah filter'],
    copyTone: 'Bahasa Indonesia analitis, spesifik, dan tidak menuduh; angka diposisikan sebagai prioritas review.',
  },
  locations: {
    key: 'locations',
    label: 'Lokasi',
    href: '/dashboard/locations',
    icon: MapPinArea,
    title: 'Peta distribusi wilayah',
    description: 'Gunakan peta kabupaten/kota offline sebagai navigasi geografis untuk melihat konsentrasi risiko dan menerapkan region_key ke Archive serta Analytics.',
    operatorHint: 'Pilih wilayah berwarna untuk menyaring arsip dan analitik; peta hanya alat navigasi berbasis buyer region yang tersedia.',
    filterTitle: 'Filter peta',
    filterDescription: 'Mempersempit agregat wilayah sebelum memilih region_key.',
    primaryPanels: ['Offline kabupaten/kota risk map', 'region filter explanation', 'active region_key state'],
    excludedPanels: ['tabel arsip penuh', 'antrean overview sebagai panel utama'],
    sharedRails: ['filter risiko/buyer/supplier', 'status inferensi', 'preview kasus/arsip terpilih'],
    stateCoverage: ['loading peta/agregat', 'wilayah tanpa data', 'region_key aktif'],
    copyTone: 'Bahasa Indonesia geografis dan jelas bahwa peta adalah alat navigasi/filter, bukan klaim pelanggaran.',
  },
  activity: {
    key: 'activity',
    label: 'Activity',
    href: '/dashboard/activity',
    icon: Pulse,
    title: 'Aktivitas sistem lokal',
    description: 'Pantau status operasi dashboard: cakupan scoring, kesiapan API lokal, filter aktif, region_key, dan bukti bahwa demo berjalan tanpa cloud call atau retraining.',
    operatorHint: 'Gunakan halaman ini untuk menjelaskan kesiapan demo dan kondisi data yang sedang dilihat sebelum presentasi atau review.',
    filterTitle: 'Filter aktivitas',
    filterDescription: 'Mencatat konteks filter yang sedang memengaruhi status dashboard.',
    primaryPanels: ['timeline/status operasional', 'KPI konteks lokal', 'status inferensi', 'filter state'],
    excludedPanels: ['Tender Archive Explorer penuh', 'Full Archive Risk Analytics penuh'],
    sharedRails: ['filter risiko/buyer/supplier', 'status inferensi', 'preview kasus/arsip terpilih'],
    stateCoverage: ['metadata inferensi kosong', 'arsip/analytics belum termuat', 'filter atau region_key aktif'],
    copyTone: 'Bahasa Indonesia status-sistem yang konkret, tanpa placeholder dan tanpa tuduhan.',
  },
};

const dashboardTabs = Object.values(dashboardTabMatrix);

function useMainScrollStickyRail(enabled: boolean, topOffset = RIGHT_RAIL_STICKY_TOP, bottomOffset = RIGHT_RAIL_STICKY_BOTTOM) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [topValue, setTopValue] = useState(topOffset);

  useEffect(() => {
    if (!enabled) {
      setTopValue(topOffset);
      return;
    }

    const element = ref.current;
    if (!element) return;

    let animationFrame = 0;
    const calculate = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const railHeight = element.scrollHeight;
        const availableHeight = window.innerHeight - topOffset - bottomOffset;
        // Oversized rails intentionally use a negative top so the bottom edge can stop flush with the viewport bottom.
        const nextTop = railHeight <= availableHeight ? topOffset : window.innerHeight - railHeight;
        setTopValue((current) => (current === nextTop ? current : nextTop));
      });
    };

    calculate();

    const ResizeObserverCtor = window.ResizeObserver;
    const observer = typeof ResizeObserverCtor === 'function' ? new ResizeObserverCtor(calculate) : null;
    observer?.observe(element);
    window.addEventListener('resize', calculate);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', calculate);
    };
  }, [bottomOffset, enabled, topOffset]);

  return { ref, topValue };
}

export function CommandCenterPage({ demoState, queue, selectedId, activeTab = 'overview', filtersOpen = false, inferenceOpen = true, selectedCaseOpen = true, onSelect, onOpenCasebook, onNavigate }: { demoState: DemoState; queue: QueueResponse; selectedId?: string; activeTab?: DashboardTab; filtersOpen?: boolean; inferenceOpen?: boolean; selectedCaseOpen?: boolean; onSelect: (id: string) => void; onOpenCasebook: () => void; onNavigate?: (href: string) => void }) {
  const initialQueryState = useMemo(dashboardQueryState, []);
  const [filters, setFilters] = useState<Filters>(initialQueryState.filters);
  const [casebookCache, setCasebookCache] = useState<Record<string, CasebookPayload>>({});
  const [loadingCasebookId, setLoadingCasebookId] = useState<string | null>(null);
  const [datasetPage, setDatasetPage] = useState(initialQueryState.datasetPage);
  const [archiveSplit, setArchiveSplit] = useState(initialQueryState.archiveSplit);
  const [archiveSort, setArchiveSort] = useState(initialQueryState.archiveSort);
  const [dataset, setDataset] = useState<ArchiveBrowserResponse | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [archiveAnalytics, setArchiveAnalytics] = useState<ArchiveAnalyticsResponse | null>(null);
  const [archiveAnalyticsLoading, setArchiveAnalyticsLoading] = useState(false);
  const [archiveAnalyticsError, setArchiveAnalyticsError] = useState<string | null>(null);
  const [datasetSelectedRow, setDatasetSelectedRow] = useState<ArchiveRow | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState(initialQueryState.selectedRegionKey);
  const archiveDetailsRef = useRef<HTMLElement | null>(null);

  const buyers = useMemo(() => unique([...queue.items, ...(dataset?.items ?? [])].map((item) => item.buyer)), [dataset?.items, queue.items]);
  const suppliers = useMemo(() => unique([...queue.items, ...(dataset?.items ?? [])].map((item) => item.supplier)), [dataset?.items, queue.items]);
  const visibleItems = useMemo(() => applyFilters(queue.items, filters), [filters, queue.items]);
  const datasetSelected = useMemo(() => dataset?.items.find((item) => item.case_id === selectedId), [dataset?.items, selectedId]);
  const selected = useMemo(
    () => visibleItems.find((item) => item.case_id === selectedId) ?? (datasetSelectedRow?.case_id === selectedId ? datasetSelectedRow : undefined) ?? datasetSelected ?? visibleItems[0] ?? dataset?.items[0],
    [dataset?.items, datasetSelected, datasetSelectedRow, selectedId, visibleItems],
  );
  const selectedCaseId = selected?.case_id;
  const derivedQueue = useMemo<QueueResponse>(() => ({ ...queue, items: visibleItems, summary: summarize(visibleItems), distribution: distribute(visibleItems) }), [queue, visibleItems]);
  const activeTabDefinition = dashboardTabMatrix[activeTab];
  const showSummaryCards = activeTab === 'overview' || activeTab === 'activity';
  const showLocationRailCards = activeTab === 'locations';
  const showArchiveRailCards = activeTab === 'archive';
  const showAnalyticsRailCards = activeTab === 'analytics';
  const showInferencePanel = inferenceOpen && !['overview', 'archive', 'analytics'].includes(activeTab);
  const rightRailOpen = showSummaryCards || showLocationRailCards || showArchiveRailCards || showAnalyticsRailCards || showInferencePanel || selectedCaseOpen;
  const rightRailSticky = useMainScrollStickyRail(rightRailOpen);
  const rightRailStackStyle = useMemo(
    () => ({ ...styles.rightRail, top: rightRailSticky.topValue }) as CSSProperties,
    [rightRailSticky.topValue],
  );

  useEffect(() => {
    setDatasetPage(1);
    setDatasetSelectedRow(null);
  }, [filters.search, filters.risk, filters.buyer, filters.supplier, selectedRegionKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = new URLSearchParams(window.location.search);
    syncQueryValue(query, 'risk', filters.risk, defaultFilters.risk);
    syncQueryValue(query, 'buyer', filters.buyer);
    syncQueryValue(query, 'supplier', filters.supplier);
    syncQueryValue(query, 'search', filters.search.trim());
    syncQueryValue(query, 'region_key', selectedRegionKey);
    syncQueryValue(query, 'sort', archiveSort, 'risk_desc');
    syncQueryValue(query, 'split', archiveSplit, 'all');
    syncQueryValue(query, 'page', String(datasetPage), '1');
    const nextUrl = `${window.location.pathname}${query.toString() ? `?${query}` : ''}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', nextUrl);
  }, [archiveSort, archiveSplit, datasetPage, filters.buyer, filters.risk, filters.search, filters.supplier, selectedRegionKey]);

  useEffect(() => {
    if (selected && selected.case_id !== selectedId) onSelect(selected.case_id);
  }, [onSelect, selected, selectedId]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    params.set('page', String(datasetPage));
    params.set('page_size', String(ARCHIVE_PAGE_SIZE));
    if (filters.risk && filters.risk !== 'all') params.set('risk', filters.risk);
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.buyer) params.set('buyer', filters.buyer);
    if (filters.supplier) params.set('supplier', filters.supplier);
    if (archiveSplit !== 'all') params.set('split', archiveSplit);
    if (selectedRegionKey) params.set('region_key', selectedRegionKey);
    params.set('sort', archiveSort);

    setDatasetLoading(true);
    setDatasetError(null);
    void api.archive(params)
      .then((payload) => {
        if (alive) setDataset(payload);
      })
      .catch((error) => {
        if (alive) setDatasetError(error instanceof Error ? error.message : 'Dataset API failed');
      })
      .finally(() => {
        if (alive) setDatasetLoading(false);
      });
    return () => { alive = false; };
  }, [archiveSort, archiveSplit, datasetPage, filters.buyer, filters.risk, filters.search, filters.supplier, selectedRegionKey]);

  useEffect(() => {
    let alive = true;
    const params = archiveFilterParams({ archiveSort, archiveSplit, filters, selectedRegionKey });
    setArchiveAnalyticsLoading(true);
    setArchiveAnalyticsError(null);
    void api.archiveAnalytics(params)
      .then((payload) => {
        if (alive) setArchiveAnalytics(payload);
      })
      .catch((error) => {
        if (alive) setArchiveAnalyticsError(error instanceof Error ? error.message : 'Archive analytics API failed');
      })
      .finally(() => {
        if (alive) setArchiveAnalyticsLoading(false);
      });
    return () => { alive = false; };
  }, [archiveSort, archiveSplit, filters.buyer, filters.risk, filters.search, filters.supplier, selectedRegionKey]);

  useEffect(() => {
    if (!datasetSelectedRow || !dataset?.items.length) return;
    const replacement = dataset.items.find((row) => row.archive_id === datasetSelectedRow.archive_id || row.case_id === datasetSelectedRow.case_id);
    if (replacement && replacement.archive_id !== datasetSelectedRow.archive_id) setDatasetSelectedRow(replacement);
  }, [dataset?.items, datasetSelectedRow]);

  useEffect(() => {
    if (!selectedCaseId || casebookCache[selectedCaseId]) return;
    if (selected?.source_split === 'train_data' || selected?.is_heldout === false) return;
    let alive = true;
    setLoadingCasebookId(selectedCaseId);
    void api.casebook(selectedCaseId)
      .then((payload) => {
        if (alive) setCasebookCache((current) => ({ ...current, [payload.case_id]: payload }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingCasebookId(null);
      });
    return () => { alive = false; };
  }, [casebookCache, selected, selectedCaseId]);

  const focusArchiveDetails = () => {
    archiveDetailsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  const selectDatasetRow = (row: ArchiveRow) => {
    setDatasetSelectedRow(row);
    onSelect(row.case_id);
    window.requestAnimationFrame(focusArchiveDetails);
  };

  const selectAnalyticsPoint = (point: ArchivePriorityPoint) => {
    const preview = archivePointToRow(point);
    setDatasetSelectedRow(preview);
    setDatasetPage(point.archive_page);
    onSelect(point.case_id);
    window.requestAnimationFrame(focusArchiveDetails);
  };

  const setRiskFromAnalytics = (risk: string) => {
    setDatasetPage(1);
    setFilters((current) => ({ ...current, risk }));
  };

  const openSelectedArchiveDetails = () => {
    if (selected && 'archive_id' in selected) {
      setDatasetSelectedRow(selected as ArchiveRow);
    }
    focusArchiveDetails();
  };

  const selectRegion = (regionKey: string) => {
    setDatasetPage(1);
    setSelectedRegionKey(regionKey);
    if (regionKey && activeTab !== 'locations') onNavigate?.('/dashboard/locations');
  };

  return (
    <main className={`dashboard-content-shell ${filtersOpen ? 'dashboard-content-shell--filter-open' : ''}`} style={styles.shell} aria-label="Dashboard content">
      <DashboardTabNav activeTab={activeTab} onNavigate={onNavigate} />
      {selectedRegionKey && <p className="badge" style={styles.regionFilter}>region_key={selectedRegionKey} applied to Archive and Analytics</p>}

      <div className={`command-grid ${filtersOpen ? 'command-grid--filter-open' : 'command-grid--filter-closed'} ${rightRailOpen ? 'command-grid--rail-open' : 'command-grid--rail-closed'}`} style={styles.grid}>
        <section className="command-center" style={styles.center}>
          <DashboardSectionIntro tab={activeTabDefinition} />
          {activeTab === 'analytics' && <AnalyticsContextStrip analytics={archiveAnalytics} activeRisk={filters.risk} selectedRegionKey={selectedRegionKey} />}

          {activeTab === 'overview' && <div className="overview-map-row" style={styles.overviewMapRow}>
            <NusantaraAtlasCarousel analytics={archiveAnalytics} onNavigate={onNavigate} />
            <RegionRiskSummary analytics={archiveAnalytics} onSelectRegion={selectRegion} />
          </div>}
          {activeTab === 'overview' && <div className="overview-chart-grid" style={styles.chartGrid}>
            <RiskDistributionChart queue={derivedQueue} archiveCounts={archiveAnalytics?.counts ?? dataset} />
            <RiskTrendChart trend={archiveAnalytics?.monthly_trends ?? dataset?.monthly_risk_trend ?? []} dateRange={dataset?.date_range} loading={archiveAnalyticsLoading || datasetLoading} />
          </div>}
          {activeTab === 'analytics' && <ArchiveAnalyticsPanel analytics={archiveAnalytics} loading={archiveAnalyticsLoading} error={archiveAnalyticsError} activeRisk={filters.risk} onRiskFilter={setRiskFromAnalytics} onSelectPoint={selectAnalyticsPoint} monthlyTrends={archiveAnalytics?.monthly_trends ?? dataset?.monthly_risk_trend ?? []} dateRange={dataset?.date_range} />}
          {activeTab === 'overview' && <RiskQueueTable items={visibleItems} selectedId={selected?.case_id} onSelect={onSelect} />}
          {activeTab === 'archive' && <ScoredDatasetExplorer ref={archiveDetailsRef} dataset={dataset} loading={datasetLoading} error={datasetError} selectedId={selected?.case_id} splitFilter={archiveSplit} sort={archiveSort} previewRow={datasetSelectedRow} onSplitChange={setArchiveSplit} onSortChange={setArchiveSort} onSelect={selectDatasetRow} onPageChange={setDatasetPage} />}
          {activeTab === 'locations' && <LokasiMap analytics={archiveAnalytics} loading={archiveAnalyticsLoading} selectedRegionKey={selectedRegionKey} onSelectRegion={selectRegion} />}
          {activeTab === 'activity' && <ActivityTimeline dataset={dataset} analytics={archiveAnalytics} selectedRegionKey={selectedRegionKey} filters={filters} archiveSplit={archiveSplit} archiveSort={archiveSort} status={queue.inference_status ?? demoState.inference_status} />}
        </section>
        {rightRailOpen && (
          <aside className="command-right" style={styles.rightRailColumn}>
            <div ref={rightRailSticky.ref} className="command-right__sticky" style={rightRailStackStyle}>
              <DashboardProfileCard />
              {showSummaryCards && <KpiCards queue={derivedQueue} archiveCounts={archiveAnalytics?.counts ?? dataset} variant="rail" />}
              {showSummaryCards && <AuditorTaskCards queue={derivedQueue} dataset={dataset} analytics={archiveAnalytics} onSelect={onSelect} onNavigate={onNavigate} />}
              {showLocationRailCards && <LocationRailCards analytics={archiveAnalytics} selectedRegionKey={selectedRegionKey} />}
              {showArchiveRailCards && <ArchiveRailCards dataset={dataset} splitFilter={archiveSplit} sort={archiveSort} selectedRegionKey={selectedRegionKey} />}
              {showAnalyticsRailCards && <AnalyticsRailCards analytics={archiveAnalytics} activeRisk={filters.risk} selectedRegionKey={selectedRegionKey} />}
              {showInferencePanel && <InferenceStatusCard id={INFERENCE_PANEL_ID} status={queue.inference_status ?? demoState.inference_status} />}
              {selectedCaseOpen && <SelectedCasePreview id={SELECTED_CASE_PANEL_ID} item={selected} casebook={selected ? casebookCache[selected.case_id] : null} loadingFactors={selected ? loadingCasebookId === selected.case_id : false} onOpen={onOpenCasebook} onOpenArchiveDetails={openSelectedArchiveDetails} onOpenLocation={selectRegion} />}
            </div>
          </aside>
        )}
        {filtersOpen && (
          <FilterRail
            id="dashboard-filter-panel"
            className="command-filter"
            filters={filters}
            setFilters={setFilters}
            reset={() => setFilters(defaultFilters)}
            buyers={buyers}
            suppliers={suppliers}
            resultCount={visibleItems.length}
            datasetMatchedCount={dataset?.matched_count ?? queue.matched_count ?? visibleItems.length}
          />
        )}
      </div>
    </main>
  );
}


function DashboardProfileCard() {
  return (
    <section className="card" style={styles.profileCard} aria-label="Dashboard operator profile">
      <span style={styles.profileCopy}>
        <small style={styles.profileLabel}>Operator profile</small>
        <strong style={styles.profileName}>{PROFILE_NAME}</strong>
        <em style={styles.profileRole}>{PROFILE_ROLE}</em>
      </span>
      <span style={styles.profileAvatar} aria-hidden="true">
        <UserCircle size={32} weight="fill" />
      </span>
    </section>
  );
}

type AuditorTask = {
  key: string;
  caseId: string;
  title: string;
  buyer: string;
  riskLabel: string;
  score: number;
  status: string;
  meta: string;
  href: string;
  actionLabel: string;
};

function AuditorTaskCards({ queue, dataset, analytics, onSelect, onNavigate }: { queue: QueueResponse; dataset: ArchiveBrowserResponse | null; analytics: ArchiveAnalyticsResponse | null; onSelect: (id: string) => void; onNavigate?: (href: string) => void }) {
  const tasks = useMemo(() => buildAuditorTasks(queue, dataset, analytics), [analytics, dataset, queue]);

  return (
    <section className="card" style={styles.auditorCard} aria-label="Auditor package tasks">
      <div style={styles.auditorHeader}>
        <span style={styles.auditorEyebrow}><ClockCountdown size={13} weight="fill" /> Auditor queue</span>
        <strong style={styles.auditorTitle}>Paket perlu dicek</strong>
      </div>
      <ol style={styles.auditorList}>
        {tasks.map((task) => (
          <li key={task.key} style={styles.auditorItem}>
            <span style={{ ...styles.auditorRiskBar, background: task.riskLabel === 'Risiko Tinggi' ? 'var(--lp-red)' : task.riskLabel === 'Risiko Sedang' ? 'var(--lp-amber)' : 'var(--lp-emerald)' }} aria-hidden="true" />
            <span style={styles.auditorItemCopy}>
              <small style={styles.auditorStatus}>{task.status}</small>
              <strong style={styles.auditorItemTitle}>{task.title}</strong>
              <span style={styles.auditorMeta}>{task.buyer}</span>
              <span style={styles.auditorMeta}>{task.meta} · score {(task.score * 100).toLocaleString('id-ID', { maximumFractionDigits: 0 })}%</span>
              <a
                href={task.href}
                style={styles.auditorAction}
                onClick={(event) => {
                  onSelect(task.caseId);
                  if (!onNavigate) return;
                  event.preventDefault();
                  onNavigate(task.href);
                }}
              >
                {task.actionLabel} <ArrowSquareOut size={13} weight="bold" />
              </a>
            </span>
          </li>
        ))}
      </ol>
      <p className="safe-copy" style={styles.auditorNote}>Daftar ini adalah prioritas kerja auditor; bukan tuduhan pelanggaran.</p>
    </section>
  );
}

function buildAuditorTasks(queue: QueueResponse, dataset: ArchiveBrowserResponse | null, analytics: ArchiveAnalyticsResponse | null): AuditorTask[] {
  const seen = new Set<string>();
  const tasks: AuditorTask[] = [];

  const addTask = (task: AuditorTask | null) => {
    if (!task || seen.has(task.caseId)) return;
    seen.add(task.caseId);
    tasks.push(task);
  };

  const urgentPoint = analytics?.priority_map?.[0];
  addTask(urgentPoint ? {
    key: `urgent-${urgentPoint.case_id}`,
    caseId: urgentPoint.case_id,
    title: urgentPoint.title,
    buyer: urgentPoint.buyer,
    riskLabel: urgentPoint.risk_label,
    score: urgentPoint.risk_score,
    status: 'Most urgent',
    meta: `${urgentPoint.source_split} · page ${urgentPoint.archive_page}`,
    href: urgentPoint.is_heldout ? `/casebook/${encodeURIComponent(urgentPoint.case_id)}?demo=1` : `/dashboard/archive?case_id=${encodeURIComponent(urgentPoint.case_id)}`,
    actionLabel: urgentPoint.is_heldout ? 'Open casebook' : 'Open archive',
  } : null);

  const latestDatasetRow = latestPublishedRow(dataset?.items ?? []);
  addTask(latestDatasetRow ? queueItemToAuditorTask(latestDatasetRow, 'Latest package', latestDatasetRow.source_split ? `${latestDatasetRow.source_split} · ${latestDatasetRow.date_published ?? 'tanggal tidak tersedia'}` : latestDatasetRow.date_published ?? 'tanggal tidak tersedia') : null);

  const nextQueueItem = [...queue.items].sort((left, right) => (right.risk_priority_score ?? right.probability) - (left.risk_priority_score ?? left.probability))[0];
  addTask(nextQueueItem ? queueItemToAuditorTask(nextQueueItem, tasks.length ? 'Next review' : 'Most urgent', `rank #${nextQueueItem.risk_rank}`) : null);

  queue.items.slice(0, 4).forEach((item, index) => {
    if (tasks.length >= 3) return;
    addTask(queueItemToAuditorTask(item, `Backlog ${index + 1}`, `rank #${item.risk_rank}`));
  });

  return tasks.slice(0, 3);
}

function queueItemToAuditorTask(item: QueueItem, status: string, meta: string): AuditorTask {
  const isArchiveOnly = item.source_split === 'train_data' || item.is_heldout === false;
  const href = isArchiveOnly ? `/dashboard/archive?case_id=${encodeURIComponent(item.case_id)}` : `/casebook/${encodeURIComponent(item.case_id)}?demo=1`;
  return {
    key: `${status}-${item.case_id}`,
    caseId: item.case_id,
    title: item.package_title,
    buyer: item.buyer,
    riskLabel: item.predicted_label,
    score: item.risk_priority_score ?? item.probability,
    status,
    meta,
    href,
    actionLabel: isArchiveOnly ? 'Open archive' : 'Open casebook',
  };
}

function latestPublishedRow(items: ArchiveRow[]) {
  return [...items]
    .filter((item) => Boolean(item.date_published))
    .sort((left, right) => Date.parse(right.date_published ?? '') - Date.parse(left.date_published ?? ''))[0] ?? null;
}

function RegionRiskSummary({ analytics, onSelectRegion }: { analytics: ArchiveAnalyticsResponse | null; onSelectRegion: (regionKey: string) => void }) {
  const topRegions = useMemo(() => {
    if (!analytics?.region_map?.length) return [];
    return [...analytics.region_map]
      .filter((r) => r.count > 0)
      .sort((a, b) => b.high_risk_count - a.high_risk_count || b.average_risk_score - a.average_risk_score)
      .slice(0, 5);
  }, [analytics?.region_map]);

  const totalMapped = analytics?.region_map?.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const totalHighRisk = analytics?.region_map?.reduce((sum, r) => sum + r.high_risk_count, 0) ?? 0;

  return (
    <section className="card" style={styles.regionSummaryCard} aria-label="Region risk summary">
      <div style={styles.regionSummaryHeader}>
        <span style={styles.regionSummaryEyebrow}><MapPinArea size={13} weight="fill" /> Konsentrasi risiko</span>
        <strong style={styles.regionSummaryTitle}>Top wilayah</strong>
      </div>
      <div style={styles.regionSummaryStats}>
        <span style={styles.regionSummaryStat}>
          <small>Total paket</small>
          <strong>{totalMapped.toLocaleString('id-ID')}</strong>
        </span>
        <span style={styles.regionSummaryStat}>
          <small>Risiko tinggi</small>
          <strong style={{ color: 'var(--lp-red)' }}>{totalHighRisk.toLocaleString('id-ID')}</strong>
        </span>
      </div>
      {topRegions.length > 0 ? (
        <ol style={styles.regionSummaryList}>
          {topRegions.map((region, idx) => {
            const riskRatio = region.count > 0 ? region.high_risk_count / region.count : 0;
            return (
              <li key={region.region_key} style={styles.regionSummaryItem}>
                <span style={styles.regionSummaryRank}>{idx + 1}</span>
                <span style={styles.regionSummaryItemBody}>
                  <button
                    style={styles.regionSummaryName}
                    onClick={() => onSelectRegion(region.region_key)}
                    title={`Filter ke ${region.label}`}
                  >
                    {region.label}
                  </button>
                  <span style={styles.regionSummaryMeta}>
                    {region.count.toLocaleString('id-ID')} paket · <span style={{ color: riskRatio >= 0.3 ? 'var(--lp-red)' : riskRatio >= 0.15 ? 'var(--lp-amber)' : 'var(--lp-emerald)', fontWeight: 600 }}>{region.high_risk_count} tinggi ({Math.round(riskRatio * 100)}%)</span>
                  </span>
                </span>
                <span style={{ ...styles.regionSummaryBar, width: `${Math.max(8, riskRatio * 100)}%`, background: riskRatio >= 0.3 ? 'var(--lp-red)' : riskRatio >= 0.15 ? 'var(--lp-amber)' : 'var(--lp-emerald)' }} aria-hidden="true" />
              </li>
            );
          })}
        </ol>
      ) : (
        <p style={{ color: 'var(--lp-muted)', fontSize: 12, margin: 0 }}>Memuat data wilayah…</p>
      )}

    </section>
  );
}


function AnalyticsRailCards({ analytics, activeRisk, selectedRegionKey }: { analytics: ArchiveAnalyticsResponse | null; activeRisk: string; selectedRegionKey: string }) {
  const highRiskCount = riskDistributionCount(analytics?.counts.risk_distribution, ['Risiko_Tinggi', 'Risiko Tinggi', 'risiko_tinggi']);
  const cards = [
    { label: 'Filtered archive', value: formatNumber(analytics?.counts.matched_count), note: 'basis agregat aktif', Icon: Archive, tone: 'var(--lp-cream)' },
    { label: 'Risk mix', value: formatNumber(highRiskCount), note: 'baris risiko tinggi', Icon: WarningCircle, tone: 'var(--lp-red)' },
    { label: 'Monthly trend', value: formatNumber(analytics?.monthly_trends.length), note: 'bucket waktu tersedia', Icon: ChartBar, tone: 'var(--lp-amber)' },
    { label: 'Priority points', value: formatNumber(analytics?.priority_map_meta.points_returned), note: 'dapat diarahkan ke arsip', Icon: MapPinArea, tone: 'var(--lp-emerald)' },
  ];

  return (
    <section className="card analytics-rail-cards" aria-label="Analytics framing" style={styles.locationRailCard}>
      <header style={styles.locationRailHeader}>
        <span style={styles.locationRailEyebrow}>Analytics framing</span>
        <strong style={styles.locationRailTitle}>{selectedRegionKey ? `region_key=${selectedRegionKey}` : activeRisk === 'all' ? 'Semua level risiko' : activeRisk}</strong>
      </header>
      <div style={styles.locationRailGrid}>
        {cards.map((card) => (
          <span key={card.label} style={styles.locationRailMetric}>
            <card.Icon size={13} weight="fill" style={{ color: card.tone, marginBottom: 2 }} aria-hidden="true" />
            <small style={styles.locationRailMetricLabel}>{card.label}</small>
            <strong style={styles.locationRailMetricValue}>{card.value}</strong>
            <em style={styles.locationRailMetricNote}>{card.note}</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function AnalyticsContextStrip({ analytics, activeRisk, selectedRegionKey }: { analytics: ArchiveAnalyticsResponse | null; activeRisk: string; selectedRegionKey: string }) {
  const highRiskCount = riskDistributionCount(analytics?.counts.risk_distribution, ['Risiko_Tinggi', 'Risiko Tinggi', 'risiko_tinggi']);
  const formatNum = (n?: number) => n == null ? '—' : n.toLocaleString('id-ID');

  return (
    <section
      data-testid="analytics-context-strip"
      aria-label="Analytics context and trust signals"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: 12,
        background: 'rgba(18, 16, 12, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(215, 209, 176, 0.18)',
        borderRadius: 'var(--lp-radius-md)',
        color: 'var(--lp-text-soft)',
      }}
    >
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'auto auto', alignItems: 'center' }}>
        <span style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 13, color: 'var(--lp-text)' }}>{formatNum(analytics?.counts.matched_count)}</strong>
          <small style={{ fontSize: 10 }}>arsip terfilter</small>
        </span>
        <span style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 13, color: 'var(--lp-text)' }}>{formatNum(highRiskCount)}</strong>
          <small style={{ fontSize: 10 }}>risiko tinggi</small>
        </span>
      </div>

      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {activeRisk !== 'all' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
            <Funnel size={11} weight="fill" />
            {activeRisk}
          </span>
        )}
        {selectedRegionKey && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
            <Funnel size={11} weight="fill" />
            {selectedRegionKey}
          </span>
        )}
      </div>

      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
          <Database size={11} weight="fill" />
          held-out
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
          <ShieldCheck size={11} weight="fill" />
          Verified local
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
          <ShieldCheck size={11} weight="fill" />
          No cloud
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 6, fontSize: 11 }}>
          <ShieldCheck size={11} weight="fill" />
          No scraping
        </span>
      </div>
    </section>
  );
}

function LocationRailCards({ analytics, selectedRegionKey }: { analytics: ArchiveAnalyticsResponse | null; selectedRegionKey: string }) {
  const meta = analytics?.region_map_meta;
  const cards = [
    { label: 'Matched regions', value: formatNumber(meta?.matched_regions), note: 'tersambung ke GeoJSON', Icon: CheckCircle, tone: 'var(--lp-emerald)' },
    { label: 'Unmatched regions', value: formatNumber(meta?.unmatched_regions), note: 'tetap tercatat', Icon: Question, tone: 'var(--lp-amber)' },
    { label: 'Map features', value: formatNumber(meta?.feature_count), note: 'asset offline', Icon: MapTrifold, tone: 'var(--lp-cream)' },
    { label: 'Mapped rows', value: formatNumber(meta?.matched_count), note: 'buyer region terderivasi', Icon: MapPinArea, tone: 'var(--lp-cream)' },
  ];

  return (
    <section className="card location-rail-cards" aria-label="Lokasi framing" style={styles.locationRailCard}>
      <header style={styles.locationRailHeader}>
        <span style={styles.locationRailEyebrow}>Lokasi framing</span>
        <strong style={styles.locationRailTitle}>{selectedRegionKey ? `region_key=${selectedRegionKey}` : 'Wilayah belum terpilih'}</strong>
      </header>
      <div style={styles.locationRailGrid}>
        {cards.map((card) => (
          <span key={card.label} style={styles.locationRailMetric}>
            <card.Icon size={13} weight="fill" style={{ color: card.tone, marginBottom: 2 }} aria-hidden="true" />
            <small style={styles.locationRailMetricLabel}>{card.label}</small>
            <strong style={styles.locationRailMetricValue}>{card.value}</strong>
            <em style={styles.locationRailMetricNote}>{card.note}</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function ArchiveRailCards({ dataset, splitFilter, sort, selectedRegionKey }: { dataset: ArchiveBrowserResponse | null; splitFilter: string; sort: string; selectedRegionKey: string }) {
  const cards = [
    { label: 'Matched rows', value: formatNumber(dataset?.matched_count), note: 'sesuai filter aktif', Icon: CheckCircle, tone: 'var(--lp-emerald)' },
    { label: 'Total archive', value: formatNumber(dataset?.total_rows), note: dataset?.archive_scope ?? 'all local prepared data', Icon: Database, tone: 'var(--lp-cream)' },
    { label: 'Rows per page', value: formatNumber(dataset?.page_size), note: 'kontrak arsip 100 baris', Icon: Stack, tone: 'var(--lp-cream)' },
    { label: 'Split view', value: splitFilter === 'all' ? 'Semua split' : splitFilter, note: sort === 'risk_desc' ? 'urut risiko tertinggi' : 'sort aktif', Icon: Funnel, tone: 'var(--lp-amber)' },
  ];

  return (
    <section className="card archive-rail-cards" aria-label="Archive browsing scope" style={styles.locationRailCard}>
      <header style={styles.locationRailHeader}>
        <span style={styles.locationRailEyebrow}>Archive framing</span>
        <strong style={styles.locationRailTitle}>{selectedRegionKey ? `region_key=${selectedRegionKey}` : 'Semua wilayah'}</strong>
      </header>
      <div style={styles.locationRailGrid}>
        {cards.map((card) => (
          <span key={card.label} style={styles.locationRailMetric}>
            <card.Icon size={13} weight="fill" style={{ color: card.tone, marginBottom: 2 }} aria-hidden="true" />
            <small style={styles.locationRailMetricLabel}>{card.label}</small>
            <strong style={styles.locationRailMetricValue}>{card.value}</strong>
            <em style={styles.locationRailMetricNote}>{card.note}</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function DashboardSectionIntro({ tab }: { tab: DashboardTabDefinition }) {
  return (
    <section className="card dashboard-section-intro" style={styles.sectionIntro} aria-label={`${tab.label} dashboard intro`}>
      <span aria-hidden="true" style={styles.sectionIntroLine} />
      <div style={styles.sectionIntroBody}>
        <div>
          <h2 style={styles.sectionIntroTitle}>{tab.title}</h2>
          <p style={styles.sectionIntroDescription}>{tab.description}</p>
        </div>
      </div>
    </section>
  );
}

function DashboardTabNav({ activeTab, onNavigate }: { activeTab: DashboardTab; onNavigate?: (href: string) => void }) {
  const [clickedTab, setClickedTab] = useState<DashboardTab | null>(null);
  const activeIndex = Math.max(0, dashboardTabs.findIndex((tab) => tab.key === activeTab));

  useEffect(() => {
    if (!clickedTab) return;
    const timeout = window.setTimeout(() => setClickedTab(null), 520);
    return () => window.clearTimeout(timeout);
  }, [clickedTab]);

  return (
    <nav className={`dashboard-floating-nav dashboard-floating-nav--active-${activeIndex}`} aria-label="Dashboard sections">
      <span className="dashboard-floating-nav__indicator" aria-hidden="true" />
      {dashboardTabs.map((tab) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.key;
        return (
          <a
            key={tab.key}
            href={tab.href}
            aria-current={selected ? 'page' : undefined}
            aria-label={tab.label}
            data-clicked={clickedTab === tab.key ? 'true' : undefined}
            onClick={(event) => {
              setClickedTab(tab.key);
              if (!onNavigate) return;
              event.preventDefault();
              onNavigate(tab.href);
            }}
          >
            <Icon size={16} weight="fill" />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function ActivityTimeline({ dataset, analytics, selectedRegionKey, filters, archiveSplit, archiveSort, status }: { dataset: ArchiveBrowserResponse | null; analytics: ArchiveAnalyticsResponse | null; selectedRegionKey: string; filters: Filters; archiveSplit: string; archiveSort: string; status?: InferenceStatus | null }) {
  const activeFilters = [
    filters.risk !== 'all' ? filters.risk : null,
    filters.search.trim() ? `search="${filters.search.trim()}"` : null,
    filters.buyer ? `buyer=${filters.buyer}` : null,
    filters.supplier ? `supplier=${filters.supplier}` : null,
    archiveSplit !== 'all' ? `split=${archiveSplit}` : null,
    selectedRegionKey ? `region_key=${selectedRegionKey}` : null,
  ].filter(Boolean).join(' · ');

  const events = [
    {
      title: 'Model scoring lokal',
      detail: status ? `${formatNumber(status.rows_scored)} baris discore melalui ${status.model_backend}; artifact ${status.model_artifact}.` : 'Metadata inferensi belum tersedia dari FastAPI lokal.',
      meta: status ? `Cold run ${formatNumber(status.total_latency_ms)} ms · ${status.inference_mode.replace('_', ' ')}` : 'menunggu status',
    },
    {
      title: 'Archive browser siap',
      detail: dataset ? `${formatNumber(dataset.matched_count)} baris cocok dengan filter dari total ${formatNumber(dataset.total_rows)} baris arsip lokal.` : 'Archive API sedang dimuat atau belum mengirim payload.',
      meta: `page_size ${formatNumber(dataset?.page_size)} · sort ${archiveSort}`,
    },
    {
      title: 'Analytics aggregate siap',
      detail: analytics ? `${formatNumber(analytics.priority_map_meta.points_returned)} titik prioritas dan ${formatNumber(analytics.regional_meta.returned)} grup wilayah/buyer tersedia untuk analisis.` : 'Analytics API sedang dimuat atau belum mengirim payload.',
      meta: analytics?.coverage_proof.no_cloud_call ? 'no cloud call · no live scraping · no retraining' : 'menunggu guardrail analytics',
    },
    {
      title: 'Konteks filter aktif',
      detail: activeFilters || 'Belum ada filter tambahan; dashboard menampilkan semua level risiko pada scope default.',
      meta: `Top-N overview ${filters.topN}`,
    },
    {
      title: 'Region routing',
      detail: selectedRegionKey ? `Region ${selectedRegionKey} aktif dan ikut membatasi Archive serta Analytics.` : 'Belum ada region_key aktif; peta Lokasi siap dipakai untuk navigasi wilayah.',
      meta: 'filter geografis bersifat navigasi data',
    },
  ];
  return (
    <section className="card dashboard-activity" style={styles.activityCard} aria-label="Dashboard activity">
      <h2 style={styles.activityTitle}>Status operasi dashboard</h2>
      <ol style={styles.activityList}>
        {events.map((event, index) => (
          <li key={event.title} style={styles.activityItem}>
            <span style={styles.activityIndex}>{String(index + 1).padStart(2, '0')}</span>
            <span style={styles.activityText}>
              <strong>{event.title}</strong>
              <span>{event.detail}</span>
              <small>{event.meta}</small>
            </span>
          </li>
        ))}
      </ol>
      <p className="safe-copy" style={styles.activityNote}>Activity mencatat kondisi UI lokal untuk triase risiko dan prioritas review; bukan tuduhan pelanggaran.</p>
    </section>
  );
}

function formatNumber(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('id-ID') : '—';
}

function riskDistributionCount(distribution: Record<string, number> | undefined, keys: readonly string[]) {
  if (!distribution) return undefined;
  return keys.reduce((matched, key) => matched ?? distribution[key], undefined as number | undefined);
}

function applyFilters(items: QueueItem[], filters: Filters): QueueItem[] {
  const search = filters.search.trim().toLocaleLowerCase('id-ID');
  const topN = Number.parseInt(filters.topN, 10) || 50;
  return items
    .filter((item) => filters.risk === 'all' || item.predicted_label === filters.risk)
    .filter((item) => !filters.buyer || item.buyer === filters.buyer)
    .filter((item) => !filters.supplier || item.supplier === filters.supplier)
    .filter((item) => !search || `${item.case_id} ${item.package_title} ${item.buyer} ${item.supplier}`.toLocaleLowerCase('id-ID').includes(search))
    .slice(0, topN);
}

function syncQueryValue(query: URLSearchParams, key: 'risk' | 'buyer' | 'supplier' | 'search' | 'region_key' | 'sort' | 'split' | 'page', value: string, defaultValue = '') {
  if (!value || value === defaultValue) query.delete(key);
  else query.set(key, value);
}

function archiveFilterParams({ archiveSort, archiveSplit, filters, selectedRegionKey }: { archiveSort: string; archiveSplit: string; filters: Filters; selectedRegionKey: string }) {
  const params = new URLSearchParams();
  if (filters.risk && filters.risk !== 'all') params.set('risk', filters.risk);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.buyer) params.set('buyer', filters.buyer);
  if (filters.supplier) params.set('supplier', filters.supplier);
  if (archiveSplit !== 'all') params.set('split', archiveSplit);
  if (selectedRegionKey) params.set('region_key', selectedRegionKey);
  params.set('sort', archiveSort);
  return params;
}

function archivePointToRow(point: ArchivePriorityPoint): ArchiveRow {
  return {
    archive_id: point.archive_id,
    archive_rank: point.filtered_rank,
    split_risk_rank: point.filtered_rank,
    case_id: point.case_id,
    source_split: point.source_split,
    is_heldout: point.is_heldout,
    eval_claim_scope: point.eval_claim_scope,
    package_title: point.title,
    buyer: point.buyer,
    supplier: point.supplier,
    tender_value_display: point.tender_value_display,
    procurement_method: 'Tidak tersedia',
    predicted_label: point.risk_label,
    probability: point.probability_high ?? point.risk_score,
    probability_high: point.probability_high ?? undefined,
    risk_rank: point.filtered_rank,
    risk_priority_score: point.risk_score,
    review_status: 'Prioritas Review',
    buyer_region: point.region,
  };
}

function summarize(items: QueueItem[]): Record<string, number> {
  return {
    total: items.length,
    risiko_tinggi: items.filter((item) => item.predicted_label === 'Risiko Tinggi').length,
    risiko_sedang: items.filter((item) => item.predicted_label === 'Risiko Sedang').length,
    risiko_rendah: items.filter((item) => item.predicted_label === 'Risiko Rendah').length,
  };
}

function distribute(items: QueueItem[]) {
  const summary = summarize(items);
  return [
    { label: 'Risiko Tinggi', count: summary.risiko_tinggi, color: '#E05A4F' },
    { label: 'Risiko Sedang', count: summary.risiko_sedang, color: '#D8A42F' },
    { label: 'Risiko Rendah', count: summary.risiko_rendah, color: '#4FA66A' },
  ];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'id-ID')).slice(0, 80);
}

const styles: Record<string, CSSProperties> = {
  shell: { width: '100%', maxWidth: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 },
  regionFilter: { margin: 0, width: 'fit-content', background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', borderColor: 'transparent' },
  grid: { display: 'grid', gap: 14 },
  center: { display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 },
  chartGrid: { display: 'grid', gap: 12, minWidth: 0 },
  overviewMapRow: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, minWidth: 0, alignItems: 'stretch' },
  rightRailColumn: { minWidth: 0 },
  rightRail: { display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 },
  profileCard: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 48px',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    background: 'var(--lp-panel)',
    borderRadius: 'var(--lp-radius-lg)',
  },
  profileAvatar: {
    width: 48,
    height: 48,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 0,
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    boxShadow: 'var(--lp-glass-shadow-soft)',
  },
  profileCopy: { display: 'grid', gap: 3, minWidth: 0, justifySelf: 'start', textAlign: 'left' },
  profileLabel: { color: 'var(--lp-muted)', fontSize: 11, fontWeight: 760, letterSpacing: '.08em', textTransform: 'uppercase' },
  profileName: { color: 'var(--lp-text)', fontSize: 18, lineHeight: 1, letterSpacing: '-.035em', overflowWrap: 'anywhere' },
  profileRole: { color: 'var(--lp-cream)', fontSize: 12, fontStyle: 'normal', fontWeight: 720, lineHeight: 1.2 },
  auditorCard: {
    display: 'grid',
    gap: 10,
    padding: 14,
    background: 'var(--lp-panel)',
  },
  auditorHeader: { display: 'grid', gap: 3 },
  auditorEyebrow: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--lp-cream)', fontSize: 11, fontWeight: 820, letterSpacing: '.08em', textTransform: 'uppercase' },
  auditorTitle: { color: 'var(--lp-text)', fontSize: 17, lineHeight: 1.04, letterSpacing: '-.025em' },
  auditorList: { display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' },
  auditorItem: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '4px minmax(0, 1fr)',
    gap: 9,
    padding: '9px 10px 9px 0',
    border: '1px solid rgba(255,255,255,.075)',
    borderRadius: 16,
    background: 'rgba(255,255,255,.035)',
    overflow: 'hidden',
  },
  auditorRiskBar: { width: 4, minHeight: '100%', borderRadius: 999 },
  auditorItemCopy: { display: 'grid', gap: 4, minWidth: 0 },
  auditorStatus: { width: 'fit-content', color: 'var(--lp-bg-deep)', background: 'var(--lp-cream)', borderRadius: 999, padding: '.18rem .42rem', fontSize: 10, fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.04em' },
  auditorItemTitle: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--lp-text)', fontSize: 12.5, lineHeight: 1.12 },
  auditorMeta: { color: 'var(--lp-muted)', fontSize: 11, lineHeight: 1.22, overflowWrap: 'anywhere' },
  auditorAction: { width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--lp-cream)', fontSize: 11.5, fontWeight: 820, textDecoration: 'none' },
  auditorNote: { margin: 0, color: 'var(--lp-muted)', fontSize: 11.2, lineHeight: 1.35 },
  scopeStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
    gap: 10,
    padding: 12,
    border: '1px solid var(--lp-line)',
    borderRadius: 'var(--lp-radius-lg)',
    background: 'var(--lp-panel)',
    boxShadow: 'var(--lp-card-depth)',
  },
  scopeMetric: {
    display: 'grid',
    gap: 3,
    padding: '10px 11px',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 'var(--lp-radius-md)',
    background: 'rgba(255,255,255,.035)',
    minWidth: 0,
  },
  scopeNote: { gridColumn: '1 / -1', margin: '2px 0 0', color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.35 },
  locationRailCard: {
    padding: 12,
    display: 'grid',
    gap: 10,
    background: 'var(--lp-panel)',
    border: '1px solid var(--lp-line)',
    borderRadius: 'var(--lp-radius-lg)',
    boxShadow: 'var(--lp-card-depth)',
  },
  locationRailHeader: { display: 'grid', gap: 2, minWidth: 0 },
  locationRailEyebrow: { color: 'var(--lp-muted)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' },
  locationRailTitle: { color: 'var(--lp-text)', fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' },
  locationRailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  locationRailMetric: {
    display: 'grid',
    gap: 2,
    padding: '8px 9px',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 'var(--lp-radius-md)',
    background: 'rgba(255,255,255,.035)',
    minWidth: 0,
  },
  locationRailMetricLabel: { color: 'var(--lp-muted)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' },
  locationRailMetricValue: { color: 'var(--lp-text)', fontSize: 16, fontWeight: 760, letterSpacing: '-.01em', lineHeight: 1.05 },
  locationRailMetricNote: { color: 'var(--lp-muted)', fontSize: 10.5, lineHeight: 1.25, fontStyle: 'normal' },
  activityCard: {
    padding: 18,
    display: 'grid',
    gap: 12,
    background: 'var(--lp-panel)',
    borderRadius: 'var(--lp-radius-lg)',
  },
  activityTitle: { margin: 0, fontSize: 23, lineHeight: 1, letterSpacing: '-.03em' },
  activityList: { listStyle: 'none', display: 'grid', gap: 8, margin: 0, padding: 0 },
  activityItem: {
    display: 'grid',
    gridTemplateColumns: '36px minmax(0, 1fr)',
    gap: 10,
    padding: 12,
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 'var(--lp-radius-md)',
    background: 'rgba(255,255,255,.035)',
  },
  activityIndex: { color: 'var(--lp-cream)', fontWeight: 840, fontSize: 12, letterSpacing: '.08em' },
  activityText: { display: 'grid', gap: 4, color: 'var(--lp-text-soft)', fontSize: 12.5, lineHeight: 1.38 },
  activityNote: { margin: 0, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.35 },
  sectionIntro: {
    padding: 12,
    display: 'grid',
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
    background: 'rgba(18, 16, 12, 0.88)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(215, 209, 176, 0.18)',
    borderRadius: 'var(--lp-radius-md)',
    boxShadow: 'none',
    color: 'var(--lp-text-soft)',
  },
  sectionIntroLine: {
    position: 'absolute',
    inset: '0 auto auto 12px',
    width: 112,
    height: 2,
    background: 'var(--lp-cream)',
    opacity: .5,
  },
  sectionIntroBody: { display: 'grid', gap: 4, alignItems: 'center', justifyItems: 'center', textAlign: 'center' },
  sectionIntroTitle: { margin: 0, color: '#FFFFFF', fontSize: 'clamp(1.45rem, 2vw, 2rem)', lineHeight: 1.05, letterSpacing: '-.035em', textWrap: 'balance' },
  sectionIntroDescription: { margin: '6px auto 0', maxWidth: 760, color: '#FFFFFF', lineHeight: 1.42, fontSize: 13 },
  sectionIntroHint: {
    display: 'grid',
    gap: 6,
    padding: 13,
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 'var(--lp-radius-md)',
    background: 'rgba(255,255,255,.035)',
    color: 'var(--lp-text-soft)',
    fontSize: 12,
    lineHeight: 1.35,
  },
  analyticsContextStrip: { display: 'grid', gridTemplateColumns: 'minmax(120px, .18fr) minmax(120px, .18fr) minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: 12, background: 'rgba(215,209,176,.08)', border: '1px solid rgba(215,209,176,.18)', color: 'var(--lp-text-soft)' },
  regionSummaryCard: {
    display: 'grid',
    gap: 7,
    padding: 10,
    background: 'var(--lp-panel)',
    borderRadius: 'var(--lp-radius-lg)',
    alignContent: 'start',
  },
  regionSummaryHeader: { display: 'grid', gap: 2 },
  regionSummaryEyebrow: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--lp-cream)', fontSize: 10, fontWeight: 820, letterSpacing: '.08em', textTransform: 'uppercase' as const },
  regionSummaryTitle: { color: 'var(--lp-text)', fontSize: 14, lineHeight: 1.04, letterSpacing: '-.025em' },
  regionSummaryStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  regionSummaryStat: { display: 'grid', gap: 1, padding: '5px 8px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, background: 'rgba(255,255,255,.035)', fontSize: 11 },
  regionSummaryList: { display: 'grid', gap: 4, margin: 0, padding: 0, listStyle: 'none' },
  regionSummaryItem: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: '16px minmax(0, 1fr)',
    gap: 6,
    padding: '5px 8px',
    border: '1px solid rgba(255,255,255,.075)',
    borderRadius: 10,
    background: 'rgba(255,255,255,.035)',
    overflow: 'hidden',
  },
  regionSummaryRank: { color: 'var(--lp-cream)', fontWeight: 840, fontSize: 10, letterSpacing: '.08em', alignSelf: 'center' },
  regionSummaryItemBody: { display: 'grid', gap: 2, minWidth: 0 },
  regionSummaryName: { all: 'unset', cursor: 'pointer', color: 'var(--lp-text)', fontSize: 11, fontWeight: 700, lineHeight: 1.12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  regionSummaryMeta: { color: 'var(--lp-muted)', fontSize: 10, lineHeight: 1.22 },
  regionSummaryBar: { position: 'absolute' as const, bottom: 0, left: 0, height: 2, borderRadius: 999, opacity: 0.7 },
  regionSummaryNote: { margin: 0, color: 'var(--lp-muted)', fontSize: 10, lineHeight: 1.35 },
};
