import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Gauge } from '@phosphor-icons/react';
import { api } from './api/client';
import type { CasebookPayload, DemoState, QueueResponse } from './types/api';
import { LandingPage } from './pages/LandingPage';
import { CommandCenterPage, type DashboardTab } from './pages/CommandCenterPage';
import { CasebookPage } from './pages/CasebookPage';
import { ModelTransparencyPage } from './pages/ModelTransparencyPage';
import { ReviewDeskPage } from './pages/ReviewDeskPage';
import { AppShell, type AppRouteKey } from './components/app/AppShell';
import { UtilityPage } from './pages/UtilityPages';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

const fallbackDemo: DemoState = {
  ready: false,
  offline_mode: true,
  demo_case_id: null,
  demo_queue_url: '/api/queue?demo=1',
  casebook_url: null,
  export_html_url: null,
  model_artifact: null,
  feature_source: null,
  raw_source: null,
  inference_status: null,
  guardrail: 'Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran, bukan putusan akhir, dan wajib ditinjau manusia.',
  golden_path_steps: [],
  production_build_status: { dist_present: false, served_by_fastapi: true, index_html: 'frontend/dist/index.html' },
};

type Page = 'landing' | 'dashboard' | 'reviews' | 'reports' | 'settings' | 'help' | 'casebook' | 'transparency' | 'login' | 'register' | 'not-found';

type RouteState = { page: Page; caseId?: string; dashboardTab?: DashboardTab; selectedId?: string; reviewOpen?: boolean };

const dashboardTabs = new Set<DashboardTab>(['overview', 'archive', 'analytics', 'locations', 'activity']);
const INFERENCE_PANEL_ID = 'dashboard-inference-panel';
const SELECTED_CASE_PANEL_ID = 'dashboard-selected-case-panel';

function routeFromLocation(location: Location): RouteState {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(location.search);
  const selectedId = query.get('case_id') || undefined;
  const casebookMatch = path.match(/^\/casebook\/(.+)$/);
  if (casebookMatch?.[1]) return { page: 'casebook', caseId: decodeURIComponent(casebookMatch[1]), reviewOpen: query.get('review') === '1' };
  if (path === '/model-transparency') return { page: 'transparency' };
  if (path === '/login' || path === '/sign-in') return { page: 'login' };
  if (path === '/register' || path === '/sign-up') return { page: 'register' };
  if (path === '/reviews' || path === '/review-desk') return { page: 'reviews' };
  if (location.search.includes('demo=1') || path === '/command-center' || path === '/dashboard') return { page: 'dashboard', dashboardTab: 'overview', selectedId };
  const dashboardMatch = path.match(/^\/dashboard\/(overview|archive|analytics|locations|activity)$/);
  if (dashboardMatch?.[1] && dashboardTabs.has(dashboardMatch[1] as DashboardTab)) return { page: 'dashboard', dashboardTab: dashboardMatch[1] as DashboardTab, selectedId };
  if (path === '/' || path === '/home') return { page: 'landing' };
  if (path === '/reports') return { page: 'reports' };
  if (path === '/settings') return { page: 'settings' };
  if (path === '/help') return { page: 'help' };
  return { page: 'not-found' };
}

function routeTitle(route: RouteState) {
  if (route.page === 'dashboard') return 'LPSE-X Dashboard';
  if (route.page === 'reports') return 'Reports Center';
  if (route.page === 'reviews') return 'Review Desk';
  if (route.page === 'settings') return 'Settings';
  if (route.page === 'help') return 'Help';
  if (route.page === 'casebook') return 'Explainable Casebook';
  if (route.page === 'transparency') return 'Model Transparency';
  if (route.page === 'login') return 'Auditor Sign-in';
  if (route.page === 'register') return 'Auditor Registration';
  if (route.page === 'not-found') return 'Halaman tidak ditemukan';
  return 'LPSE-X Home';
}

function appRouteKey(route: RouteState): AppRouteKey {
  if (route.page === 'landing') return 'home';
  if (route.page === 'dashboard') return 'dashboard';
  return route.page;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section className="card" role="alert" style={{ maxWidth: 720, padding: 24 }}>
        <span className="badge">Safe local fallback</span>
        <h1>Data demo belum dapat dimuat</h1>
        <p style={{ color: 'var(--lp-muted)' }}>{message}</p>
        <p className="safe-copy">Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran.</p>
        {onRetry && <button onClick={onRetry}>Retry local API</button>}
      </section>
    </main>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section className="card" aria-busy="true" style={{ maxWidth: 640, padding: 24 }}>
        <span className="badge">Offline local</span>
        <h1>{label}</h1>
        <p className="safe-copy">Memuat triase risiko untuk prioritas review; bukan tuduhan pelanggaran.</p>
      </section>
    </main>
  );
}

export function App() {
  const initialRoute = routeFromLocation(window.location);
  const [route, setRoute] = useState<RouteState>(() => initialRoute);
  const [demoState, setDemoState] = useState<DemoState>(fallbackDemo);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [casebook, setCasebook] = useState<CasebookPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => initialRoute.selectedId ?? initialRoute.caseId);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [casebookError, setCasebookError] = useState<string | null>(null);
  const [casebookLoading, setCasebookLoading] = useState(false);
  const [dashboardFiltersOpen, setDashboardFiltersOpen] = useState(false);
  const [dashboardInferenceOpen, setDashboardInferenceOpen] = useState(true);
  const [dashboardSelectedCaseOpen, setDashboardSelectedCaseOpen] = useState(true);

  const navigate = useCallback((href: string) => {
    window.history.pushState(null, '', href);
    setRoute(routeFromLocation(window.location));
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueError(null);
    const params = new URLSearchParams();
    params.set('demo', '1');
    try {
      const payload = await api.queue(params);
      setQueue(payload);
      setSelectedId((current) => current ?? payload.demo_case_id ?? payload.items[0]?.case_id);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Queue API failed');
    }
  }, []);

  const loadCasebook = useCallback(async (caseId: string) => {
    setCasebookLoading(true);
    setCasebookError(null);
    setSelectedId(caseId);
    try {
      const payload = await api.casebook(caseId);
      setCasebook(payload);
      return payload;
    } catch (error) {
      setCasebook(null);
      setCasebookError(error instanceof Error ? error.message : 'Casebook API failed');
      return null;
    } finally {
      setCasebookLoading(false);
    }
  }, []);

  useEffect(() => {
    void api.demoState().then(setDemoState).catch(() => setDemoState(fallbackDemo));
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const next = () => setRoute(routeFromLocation(window.location));
    window.addEventListener('popstate', next);
    return () => window.removeEventListener('popstate', next);
  }, []);

  useEffect(() => {
    if (route.page === 'dashboard' && route.selectedId) {
      setSelectedId(route.selectedId);
    }
  }, [route.page, route.selectedId]);

  useEffect(() => {
    if (route.page === 'casebook' && route.caseId && casebook?.case_id !== route.caseId) {
      void loadCasebook(route.caseId);
    }
  }, [casebook?.case_id, loadCasebook, route.caseId, route.page]);

  const openDashboard = () => navigate('/dashboard/overview');

  const openCasebook = async () => {
    const caseId = selectedId ?? demoState.demo_case_id ?? queue?.demo_case_id ?? queue?.items[0]?.case_id;
    if (!caseId) return;
    await loadCasebook(caseId);
    navigate(`/casebook/${encodeURIComponent(caseId)}?demo=1`);
  };

  const exportUrl = useMemo(() => casebook ? api.exportUrl(casebook.case_id) : '#', [casebook]);

  const shell = (
    children: React.ReactNode,
    options?: {
      panelActions?: React.ComponentProps<typeof AppShell>['panelActions'];
      filterAction?: { visible: boolean; expanded: boolean; onToggle: () => void };
    },
  ) => (
    <AppShell
      active={appRouteKey(route)}
      title={routeTitle(route)}
      onNavigate={navigate}
      panelActions={options?.panelActions}
      filterAction={options?.filterAction}
    >
      {children}
    </AppShell>
  );

  if (route.page === 'casebook') {
    if (casebookLoading) return shell(<LoadingCard label="Memuat explainable casebook" />);
    if (casebookError) return shell(<ErrorCard message={casebookError} onRetry={() => route.caseId && void loadCasebook(route.caseId)} />);
    if (casebook) return shell(<CasebookPage casebook={casebook} exportUrl={exportUrl} onBack={openDashboard} reviewOpen={route.reviewOpen} />);
    return shell(<LoadingCard label="Menyiapkan explainable casebook" />);
  }

  if (route.page === 'transparency') return shell(<ModelTransparencyPage />);
  if (route.page === 'login') return <LoginPage onNavigate={navigate} />;
  if (route.page === 'register') return <RegisterPage onNavigate={navigate} />;
  if (route.page === 'reviews') return shell(<ReviewDeskPage onNavigate={navigate} />);
  if (route.page === 'dashboard') {
    if (queueError) return <ErrorCard message={queueError} onRetry={() => void loadQueue()} />;
    if (queue) {
      return shell(
        <CommandCenterPage
          demoState={demoState}
          queue={queue}
          selectedId={selectedId}
          activeTab={route.dashboardTab ?? 'overview'}
          filtersOpen={dashboardFiltersOpen}
          inferenceOpen={dashboardInferenceOpen}
          selectedCaseOpen={dashboardSelectedCaseOpen}
          onSelect={setSelectedId}
          onOpenCasebook={openCasebook}
          onNavigate={navigate}
        />,
        {
          panelActions: [
            {
              key: 'inference',
              label: 'Inference',
              expandedLabel: 'Hide inference',
              controls: INFERENCE_PANEL_ID,
              expanded: dashboardInferenceOpen,
              onToggle: () => setDashboardInferenceOpen((current) => !current),
              icon: <Gauge size={16} weight="fill" />,
              visible: !['overview', 'archive', 'analytics'].includes(route.dashboardTab ?? 'overview'),
            },
            {
              key: 'selected-use-case',
              label: 'Use case',
              expandedLabel: 'Hide use case',
              controls: SELECTED_CASE_PANEL_ID,
              expanded: dashboardSelectedCaseOpen,
              onToggle: () => setDashboardSelectedCaseOpen((current) => !current),
              icon: <Briefcase size={16} weight="fill" />,
            },
          ],
          filterAction: {
            visible: true,
            expanded: dashboardFiltersOpen,
            onToggle: () => setDashboardFiltersOpen((current) => !current),
          },
        },
      );
    }
    return <LoadingCard label="Memuat audit dashboard" />;
  }
  if (route.page === 'reports' || route.page === 'settings' || route.page === 'help' || route.page === 'not-found') {
    return shell(<UtilityPage kind={route.page} onNavigate={navigate} />);
  }
  return shell(<LandingPage demoState={demoState} onOpen={openDashboard} onOpenCasebook={openCasebook} onNavigate={navigate} />);
}
