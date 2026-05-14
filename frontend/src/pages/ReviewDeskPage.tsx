import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClipboardText,
  ClockClockwise,
  Funnel,
  MagnifyingGlass,
  Package,
  SealCheck,
  Stack,
  UserCircle,
  WarningCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import type { ReviewListResponse, ReviewRecord, ReviewStatus } from '../types/api';
import { RiskChip } from '../components/shared/RiskChip';
import { glassSubtleSurface } from '../components/shared/glassStyles';
import dashboardSectionIntroBackground from '../assets/dashboard/dashboard-section-intro-background.jpeg';

const defaultStatuses: ReviewStatus[] = ['Perlu Review', 'Sedang Direview', 'Butuh Bukti Tambahan', 'Ditandai Risiko', 'Clear / Tidak Prioritas', 'Selesai'];
const REVIEW_PAGE_SIZE = 100;
const REVIEW_QUEUE_SCOPE = 500;

export function ReviewDeskPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [reviews, setReviews] = useState<ReviewListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(REVIEW_PAGE_SIZE));
    params.set('top_n', String(REVIEW_QUEUE_SCOPE));
    if (status !== 'all') params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    void api.reviews(params)
      .then((payload) => {
        if (alive) {
          setReviews(payload);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Review API failed');
      });
    return () => { alive = false; };
  }, [page, search, status]);

  const statuses = reviews?.statuses ?? defaultStatuses;
  const currentItems = reviews?.items ?? [];
  const total = reviews?.total_items ?? currentItems.length;
  const savedCount = useMemo(() => reviews?.items.filter((item) => item.is_saved).length ?? 0, [reviews?.items]);
  const signedOffCount = useMemo(() => reviews?.items.filter((item) => Boolean(item.signed_off_at)).length ?? 0, [reviews?.items]);
  const activeFilterCount = Number(status !== 'all') + Number(Boolean(search.trim()));
  const statusCards = statuses.map((item) => ({ status: item, count: reviews?.counts[item] ?? 0, ...statusTone(item) }));
  const currentPage = reviews?.page ?? page;
  const pageSize = reviews?.page_size ?? REVIEW_PAGE_SIZE;
  const totalPages = reviews?.total_pages ?? 1;
  const rangeStart = total ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = total ? Math.min(currentPage * pageSize, total) : 0;

  return (
    <main className="review-desk-page" style={styles.shell}>
      <section className="card review-desk-hero" style={styles.hero}>
        <div style={styles.heroCopy}>
          <p style={styles.eyebrow}><ClipboardText size={13} weight="fill" /> Hybrid human sign-off</p>
          <h1 style={styles.title}>Package Review Desk</h1>
          <p style={styles.copy}>Kelola keputusan reviewer yang tersimpan lokal. Model menyiapkan rationale dan checklist; manusia memilih status final dan menandatangani catatan review.</p>
        </div>
        <div className="review-desk-hero__metrics" style={styles.heroMetrics} aria-label="Review worklist summary">
          <ReviewMetric label="Worklist" value={total} icon={Package} />
          <ReviewMetric label="Saved" value={savedCount} icon={SealCheck} />
          <ReviewMetric label="Signed off" value={signedOffCount} icon={CheckCircle} />
        </div>
      </section>

      <section className="card review-desk-toolbar" style={styles.toolbar} aria-label="Review filters">
        <div style={styles.toolbarIntro}>
          <span style={styles.toolbarIcon}><Funnel size={17} weight="fill" /></span>
          <span>
            <strong style={styles.toolbarTitle}>Worklist filters</strong>
            <small style={styles.toolbarCopy}>{activeFilterCount ? `${activeFilterCount} filter aktif` : `Top ${REVIEW_QUEUE_SCOPE} queue scope`}</small>
          </span>
        </div>
        <label style={styles.fieldLabel}>
          <span style={styles.fieldCaption}><MagnifyingGlass size={14} weight="bold" /> Search packages</span>
          <input
            style={styles.input}
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Buyer, supplier, package title"
          />
        </label>
        <label style={styles.fieldLabel}>
          <span style={styles.fieldCaption}><Stack size={14} weight="bold" /> Status</span>
          <select
            style={styles.input}
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="all">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {activeFilterCount > 0 && (
          <button
            type="button"
            style={styles.resetButton}
            onClick={() => {
              setSearch('');
              setStatus('all');
              setPage(1);
            }}
          >
            Reset
          </button>
        )}
      </section>

      {error && <section className="card" role="alert" style={styles.error}>Review API failed: {error}</section>}

      <section className="review-count-grid" style={styles.countGrid} aria-label="Review status counts">
        {statusCards.map((item) => {
          const Icon = item.Icon as PhosphorIcon;
          return (
          <article key={item.status} className="card review-status-card" style={{ ...styles.countCard, '--review-tone': item.tone } as CSSProperties}>
            <span style={styles.statusIcon} aria-hidden="true"><Icon size={18} weight="fill" /></span>
            <strong style={styles.countLabel}>{item.status}</strong>
            <span style={styles.countNumber}>{item.count}</span>
          </article>
          );
        })}
      </section>

      <section className="card review-worklist-card" style={styles.tableCard} aria-label="Saved package review worklist">
        <div style={styles.tableHeader}>
          <span>
            <h2 style={styles.sectionTitle}>Saved review worklist</h2>
            <p style={styles.tableSubtitle}>Showing {rangeStart}-{rangeEnd} of {total.toLocaleString('id-ID')} priority queue packages.</p>
          </span>
          <p className="safe-copy" style={styles.safeCopy}>triase risiko · prioritas review · bukan tuduhan pelanggaran</p>
        </div>
        <div style={styles.rows}>
          {currentItems.map((item) => (
            <ReviewDeskRow key={item.case_id} item={item} onNavigate={onNavigate} />
          ))}
          {reviews?.items.length === 0 && <p style={styles.stateCopy}>No matching reviews yet.</p>}
          {!reviews && !error && <p style={styles.stateCopy}>Loading local review database...</p>}
        </div>
        {totalPages > 1 && (
          <nav style={styles.pagination} aria-label="Review worklist pagination">
            <p style={styles.paginationCopy}>Page {currentPage.toLocaleString('id-ID')} of {totalPages.toLocaleString('id-ID')}</p>
            <div style={styles.paginationActions}>
              <button
                type="button"
                aria-label="Previous review page"
                disabled={currentPage <= 1}
                style={currentPage <= 1 ? { ...styles.pageButton, ...styles.pageButtonDisabled } : styles.pageButton}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <CaretLeft size={15} weight="bold" /> Previous
              </button>
              <button
                type="button"
                aria-label="Next review page"
                disabled={currentPage >= totalPages}
                style={currentPage >= totalPages ? { ...styles.pageButton, ...styles.pageButtonDisabled } : styles.pageButton}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Next <CaretRight size={15} weight="bold" />
              </button>
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}

function ReviewMetric({ label, value, icon: Icon }: { label: string; value: number; icon: PhosphorIcon }) {
  return (
    <span style={styles.heroMetric}>
      <Icon size={18} weight="fill" style={styles.heroMetricIcon} aria-hidden="true" />
      <span style={styles.heroMetricCopy}>
        <strong style={styles.heroMetricValue}>{value.toLocaleString('id-ID')}</strong>
        <small style={styles.heroMetricLabel}>{label}</small>
      </span>
    </span>
  );
}

function ReviewDeskRow({ item, onNavigate }: { item: ReviewRecord; onNavigate: (href: string) => void }) {
  const title = String(item.package_snapshot.package_title ?? 'Untitled procurement package');
  const buyer = String(item.package_snapshot.buyer ?? '-');
  const supplier = String(item.package_snapshot.supplier ?? '-');
  const riskLabel = String(item.model_snapshot.predicted_label ?? 'Risiko');
  const probability = readNumber(item.model_snapshot.probability_high ?? item.model_snapshot.probability);
  const href = `/casebook/${encodeURIComponent(item.case_id)}?review=1`;
  return (
    <article className="review-worklist-row" style={styles.row}>
      <div style={styles.rowMain}>
        <div style={styles.rowTopline}>
          <RiskChip label={riskLabel} />
          <span className="badge">{item.is_saved ? 'Saved review' : 'Draft from casebook'}</span>
          {typeof probability === 'number' && <span style={styles.scoreBadge}>{Math.round(probability * 100)}% priority</span>}
        </div>
        <h3 style={styles.rowTitle}>{title}</h3>
        <p style={styles.rowCopy}>{buyer} · {supplier} · {item.case_id}</p>
      </div>
      <div style={styles.rowMeta}>
        <strong style={styles.rowStatus}>{item.status}</strong>
        <span style={styles.reviewerLine}><UserCircle size={14} weight="fill" /> {item.reviewer_name || 'Unassigned reviewer'}</span>
        <small style={styles.rowDate}>{formatReviewDate(item.signed_off_at ?? item.updated_at ?? item.created_at)}</small>
      </div>
      <a
        href={href}
        className="review-row-action"
        style={styles.openLink}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(href);
        }}
      >
        Open review drawer <ArrowUpRight size={15} weight="bold" />
      </a>
    </article>
  );
}

function statusTone(status: ReviewStatus) {
  if (status === 'Perlu Review') return { tone: 'var(--lp-red)', Icon: WarningCircle };
  if (status === 'Sedang Direview') return { tone: 'var(--lp-amber)', Icon: ClockClockwise };
  if (status === 'Butuh Bukti Tambahan') return { tone: 'var(--lp-cream)', Icon: Stack };
  if (status === 'Ditandai Risiko') return { tone: 'var(--lp-red)', Icon: Funnel };
  if (status === 'Clear / Tidak Prioritas') return { tone: 'var(--lp-emerald)', Icon: CheckCircle };
  return { tone: 'var(--lp-cream)', Icon: SealCheck };
}

function readNumber(value: string | number | boolean | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatReviewDate(value: string | null) {
  if (!value) return 'Belum ditandatangani';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const styles: Record<string, CSSProperties> = {
  shell: { display: 'grid', gap: 12, alignContent: 'start' },
  hero: {
    padding: 16,
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.42fr)',
    gap: 16,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundImage: `url(${dashboardSectionIntroBackground})`,
    backgroundPosition: 'center',
    backgroundSize: 'calc(100% + 44px) auto',
    border: '1px solid rgba(255, 255, 255, 0.42)',
    outline: '1px solid rgba(215, 209, 176, 0.24)',
    outlineOffset: '-3px',
    borderRadius: 'var(--lp-radius-md)',
    boxShadow: 'none',
  },
  heroCopy: { minWidth: 0 },
  eyebrow: { margin: 0, color: '#FFFFFF', fontSize: 12, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.08em', display: 'inline-flex', alignItems: 'center', gap: 7 },
  title: { margin: '6px 0 0', color: '#FFFFFF', fontSize: '2.55rem', letterSpacing: 0, lineHeight: .98, textWrap: 'balance' },
  copy: { margin: '8px 0 0', maxWidth: 760, color: 'rgba(255,255,255,.88)', lineHeight: 1.5, fontSize: 13.5, textWrap: 'pretty' },
  heroMetrics: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, minWidth: 0 },
  heroMetric: { minWidth: 0, display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '10px 11px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 'var(--lp-radius-sm)', background: 'rgba(17,16,15,.42)', color: '#FFFFFF' },
  heroMetricIcon: { color: 'var(--lp-cream)' },
  heroMetricCopy: { display: 'grid', gap: 1, minWidth: 0 },
  heroMetricValue: { color: '#FFFFFF', fontSize: 21, fontWeight: 860, letterSpacing: 0, lineHeight: 1 },
  heroMetricLabel: { color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 720, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  toolbar: { padding: 12, display: 'grid', gridTemplateColumns: 'minmax(190px,.36fr) minmax(260px,1fr) minmax(210px,.36fr) auto', gap: 10, alignItems: 'end', background: 'var(--lp-panel)' },
  toolbarIntro: { display: 'grid', gridTemplateColumns: '38px minmax(0,1fr)', gap: 10, alignItems: 'center', minWidth: 0, alignSelf: 'center' },
  toolbarIcon: { width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 15, background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', boxShadow: 'var(--lp-glass-shadow-soft)' },
  toolbarTitle: { display: 'block', color: 'var(--lp-text)', fontSize: 15, lineHeight: 1.1 },
  toolbarCopy: { display: 'block', marginTop: 3, color: 'var(--lp-muted)', fontSize: 11.5, lineHeight: 1.25 },
  fieldLabel: { color: 'var(--lp-text-soft)', fontWeight: 780, display: 'grid', gap: 7, fontSize: 12.5, minWidth: 0 },
  fieldCaption: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--lp-text-soft)' },
  input: { width: '100%', minHeight: 39, borderRadius: 13, color: 'var(--lp-text)', padding: '.72rem .82rem', ...glassSubtleSurface },
  resetButton: { minHeight: 39, border: '1px solid rgba(215,209,176,.28)', borderRadius: 999, padding: '0 .86rem', background: 'rgba(215,209,176,.1)', color: 'var(--lp-cream)', fontWeight: 820 },
  error: { padding: 14, color: '#FECACA', borderColor: 'rgba(248,113,113,.35)' },
  countGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 10 },
  countCard: { padding: 12, display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 8, minHeight: 104, alignContent: 'space-between', background: 'var(--lp-panel)' },
  statusIcon: { width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.045)', color: 'var(--review-tone)' },
  countLabel: { color: 'var(--lp-text-soft)', fontSize: 12, lineHeight: 1.18, fontWeight: 760, overflowWrap: 'anywhere' },
  countNumber: { gridColumn: '1 / -1', fontSize: 28, fontWeight: 900, color: 'var(--lp-text)', letterSpacing: 0, lineHeight: .95 },
  tableCard: { padding: 0, overflow: 'hidden' },
  tableHeader: { padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', borderBottom: '1px solid rgba(255,255,255,.08)' },
  sectionTitle: { margin: 0, color: 'var(--lp-text)', fontSize: 20, lineHeight: 1, letterSpacing: 0 },
  tableSubtitle: { margin: '5px 0 0', color: 'var(--lp-muted)', fontSize: 12.5, lineHeight: 1.35 },
  safeCopy: { margin: 0, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.35, textAlign: 'right' },
  rows: { display: 'grid' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(170px,.28fr) auto', gap: 14, alignItems: 'center', padding: 16, borderTop: '1px solid rgba(255,255,255,.06)' },
  rowMain: { minWidth: 0 },
  rowTopline: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  scoreBadge: { display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '.42rem .66rem', border: '1px solid rgba(215,209,176,.24)', background: 'rgba(215,209,176,.1)', color: 'var(--lp-cream)', fontSize: 12, fontWeight: 820, lineHeight: 1 },
  rowTitle: { margin: '9px 0 0', color: 'var(--lp-text)', fontSize: 17.5, letterSpacing: 0, lineHeight: 1.18, textWrap: 'pretty' },
  rowCopy: { margin: '6px 0 0', color: 'var(--lp-muted)', lineHeight: 1.4, fontSize: 12.5, overflowWrap: 'anywhere' },
  rowMeta: { display: 'grid', gap: 5, minWidth: 0 },
  rowStatus: { color: 'var(--lp-text)', fontSize: 13, lineHeight: 1.2 },
  reviewerLine: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.25, minWidth: 0, overflowWrap: 'anywhere' },
  rowDate: { color: 'var(--lp-muted)', fontSize: 11.5, lineHeight: 1.2 },
  openLink: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 999, padding: '.72rem .9rem', background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', textDecoration: 'none', fontWeight: 850, whiteSpace: 'nowrap', boxShadow: 'var(--lp-glass-shadow-soft)' },
  stateCopy: { margin: 0, padding: 18, color: 'var(--lp-muted)', lineHeight: 1.5 },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.025)', flexWrap: 'wrap' },
  paginationCopy: { margin: 0, color: 'var(--lp-muted)', fontSize: 12.5, fontWeight: 720 },
  paginationActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pageButton: { minHeight: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid rgba(215,209,176,.24)', borderRadius: 999, padding: '0 .9rem', background: 'rgba(215,209,176,.1)', color: 'var(--lp-cream)', fontWeight: 820 },
  pageButtonDisabled: { opacity: .45, cursor: 'not-allowed' },
};
