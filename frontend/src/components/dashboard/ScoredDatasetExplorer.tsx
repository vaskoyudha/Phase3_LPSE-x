import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArchiveBrowserResponse, ArchiveRow } from '../../types/api';
import { glassControlSurface, glassCreamSurface } from '../shared/glassStyles';

type BuyerRegionFields = {
  buyer_region?: string | null;
  buyer_region_type?: string | null;
  buyer_region_source?: string | null;
  buyer_region_note?: string | null;
};

type Props = {
  dataset: ArchiveBrowserResponse | null;
  loading?: boolean;
  error?: string | null;
  selectedId?: string;
  splitFilter?: string;
  sort?: string;
  previewRow?: ArchiveRow | null;
  onSplitChange?: (split: string) => void;
  onSortChange?: (sort: string) => void;
  onSelect: (row: ArchiveRow) => void;
  onPageChange: (page: number) => void;
};

export const ScoredDatasetExplorer = forwardRef<HTMLElement, Props>(function ScoredDatasetExplorer({ dataset, loading = false, error = null, selectedId, splitFilter = 'all', sort = 'risk_desc', previewRow = null, onSplitChange, onSortChange, onSelect, onPageChange }, ref) {
  const rows = dataset?.items ?? [];
  const totalRows = dataset?.total_rows ?? 0;
  const matched = dataset?.matched_count ?? 0;
  const heldoutRows = dataset?.heldout_rows ?? 93034;
  const trainRows = dataset?.train_rows ?? 372150;
  const modelArtifact = dataset?.inference_status.model_artifact ?? 'model_risk.ubj';
  const page = dataset?.page ?? 1;
  const totalPages = dataset?.total_pages ?? 1;
  const firstVisible = rows.length ? (page - 1) * (dataset?.page_size ?? rows.length) + 1 : 0;
  const lastVisible = rows.length ? firstVisible + rows.length - 1 : 0;
  const isFiltered = matched > 0 && totalRows > 0 && matched !== totalRows;
  const selectedRow = rows.find((row) => row.case_id === selectedId) ?? (previewRow?.case_id === selectedId ? previewRow : null) ?? rows[0];
  const fmt = (n: number) => n.toLocaleString('id-ID');

  return (
    <section ref={ref} className="card" style={styles.card} aria-label="Full tender archive explorer">
      <span aria-hidden="true" style={styles.accentLine} />
      <div style={styles.header}>
        <div style={styles.headerText}>
          <h2 style={styles.title}>Tender Archive Explorer</h2>
          <p style={styles.muted}>Full Archive mencakup seluruh train_data dan held-out test_data lokal dengan label split per baris; bukti inferensi held-out tetap terpisah.</p>
        </div>
        <div style={styles.pager}>
          <span style={styles.pageLabel}>Page {fmt(page)} of {fmt(totalPages)}</span>
        </div>
      </div>

      <div style={styles.heroRow} aria-label="Archive size summary">
        <span style={styles.heroNumber}>{totalRows ? fmt(totalRows) : '—'}</span>
        <span style={styles.heroUnit}>records</span>
        <span style={styles.heroDivider} aria-hidden="true" />
        <span style={styles.heroCaption}>
          <strong style={styles.heroCaptionStrong}>{fmt(trainRows)}</strong> train
          <span style={styles.heroPlus} aria-hidden="true"> + </span>
          <strong style={styles.heroCaptionStrong}>{fmt(heldoutRows)}</strong> held-out
          <span style={styles.heroDot} aria-hidden="true"> · </span>
          <span style={styles.heroArtifact}>{modelArtifact}</span>
        </span>
      </div>

      {isFiltered && (
        <p style={styles.matchedNote} role="status" aria-live="polite">
          Showing <strong style={styles.matchedNoteStrong}>{fmt(matched)}</strong> of {fmt(totalRows)} records
        </p>
      )}

      <div style={styles.controls}>
        <div role="radiogroup" aria-label="Archive split filter" style={styles.splitGroup}>
          {[
            ['all', 'All'],
            ['test_data', 'Held-out'],
            ['train_data', 'Train'],
          ].map(([value, label]) => {
            const active = splitFilter === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { onPageChange(1); onSplitChange?.(value); }}
                style={{ ...styles.splitOption, ...(active ? styles.splitOptionActive : undefined) }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label style={styles.sortLabel}>
          <span style={styles.sortLabelText}>Sort</span>
          <select
            value={sort}
            onChange={(event) => { onPageChange(1); onSortChange?.(event.target.value); }}
            style={styles.sortSelect}
            aria-label="Archive sort"
          >
            <option value="risk_desc">Risk priority</option>
            <option value="value_desc">Tender value</option>
            <option value="date_desc">Latest date</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" style={styles.error}>Archive API gagal: {error}</p>}
      {loading && <p style={styles.muted}>Memuat halaman arsip tender lokal...</p>}

      <div style={styles.tableFrame}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Header>Risk</Header>
              <Header>Buyer Region</Header>
              <Header>Package / Dataset ID</Header>
              <Header>Buyer</Header>
              <Header>Supplier</Header>
              <Header>Value</Header>
              <Header>Category / Status</Header>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={styles.emptyState}>Tidak ada baris arsip yang cocok dengan filter saat ini.</td>
              </tr>
            )}
            {rows.map((row) => {
              const selected = row.case_id === selectedId;
              const riskStyle = riskTone(row.predicted_label);
              const region = buyerRegion(row);
              return (
                <tr key={row.archive_id} onClick={() => onSelect(row)} style={{ ...styles.row, ...(selected ? styles.selectedRow : undefined) }} aria-selected={selected}>
                  <Cell><span style={{ ...styles.riskPill, ...riskStyle }}>{row.predicted_label}</span></Cell>
                  <Cell>
                    <span style={styles.oneLine}>{region.label}</span>
                    <small style={styles.subLine}>{region.meta}</small>
                  </Cell>
                  <Cell>
                    <strong style={styles.oneLine}>{row.package_title}</strong>
                    <small style={styles.subLine}>{row.ocid ?? row.tender_id ?? row.archive_id}</small>
                  </Cell>
                  <Cell><span style={styles.oneLine}>{row.buyer}</span></Cell>
                  <Cell><span style={styles.oneLine}>{row.supplier}</span></Cell>
                  <Cell><span style={styles.oneLine}>{row.tender_value_display}</span></Cell>
                  <Cell><span style={styles.oneLine}>{row.category && row.category !== 'Tidak tersedia' ? row.category : row.procurement_method || '—'}</span><small style={styles.subLine}>{row.status && row.status !== 'Tidak tersedia' ? row.status : ''}</small></Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>



      <div style={styles.paginationBar}>
        <span style={styles.paginationInfo}>
          Showing <strong>{firstVisible.toLocaleString('id-ID')}</strong>–<strong>{lastVisible.toLocaleString('id-ID')}</strong> of <strong>{matched.toLocaleString('id-ID')}</strong> rows
        </span>
        <div style={styles.paginationControls}>
          <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(1)} style={styles.paginationBtn} aria-label="First page">{'«'}</button>
          <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} style={styles.paginationBtn} aria-label="Previous page">{'‹'}</button>
          {paginationRange(page, totalPages).map((p, i) => (
            p === '...' ? <span key={`ellipsis-${i}`} style={styles.paginationEllipsis}>…</span> : (
              <button key={p} type="button" onClick={() => onPageChange(p as number)} style={{ ...styles.paginationBtn, ...(p === page ? styles.paginationBtnActive : undefined) }}>{p}</button>
            )
          ))}
          <button type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))} style={styles.paginationBtn} aria-label="Next page">{'›'}</button>
          <button type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(totalPages)} style={styles.paginationBtn} aria-label="Last page">{'»'}</button>
        </div>
      </div>
    </section>
  );
});

function Detail({ label, value }: { label: string; value: string }) {
  return <span style={styles.detailItem}><small>{label}</small><strong>{value}</strong></span>;
}

function Header({ children }: { children: string }) {
  return <th style={styles.th}>{children}</th>;
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td style={{ ...styles.td, fontWeight: strong ? 900 : 650 }}>{children}</td>;
}

function ProbabilityBar({ value = 0 }: { value?: number }) {
  const bounded = Math.max(0, Math.min(1, value));
  return <span style={styles.probWrap}><span style={{ ...styles.probBar, width: `${Math.round(bounded * 100)}%` }} /><strong>{pct(value)}</strong></span>;
}

function SplitChip({ row }: { row: ArchiveRow }) {
  return <span style={{ ...styles.splitChip, ...(row.is_heldout ? styles.heldoutChip : styles.trainChip) }}>{row.is_heldout ? 'Held-out' : 'Train'}</span>;
}

function buyerRegion(row: ArchiveRow) {
  const fields = row as ArchiveRow & BuyerRegionFields;
  const label = cleanText(fields.buyer_region) || 'Belum tersedia';
  const type = cleanText(fields.buyer_region_type);
  const source = cleanText(fields.buyer_region_source) || 'derived_from_buyer_name';
  const note = cleanText(fields.buyer_region_note);
  return {
    label,
    meta: type ? `Derived · ${type}` : 'Derived from buyer name',
    source,
    note,
  };
}

function cleanText(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function pct(value?: number) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function paginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function riskTone(label: string): CSSProperties {
  if (label.includes('Tinggi')) return { color: '#E05A4F', background: 'rgba(224,90,79,.16)', borderColor: 'rgba(224,90,79,.34)' };
  if (label.includes('Rendah')) return { color: '#4FA66A', background: 'rgba(79,166,106,.15)', borderColor: 'rgba(79,166,106,.32)' };
  return { color: '#D8A42F', background: 'rgba(216,164,47,.16)', borderColor: 'rgba(216,164,47,.32)' };
}

const styles: Record<string, CSSProperties> = {
  card: { padding: 18, display: 'grid', gap: 14, overflow: 'hidden', background: 'var(--lp-panel)', position: 'relative' },
  accentLine: { position: 'absolute', inset: '0 auto auto 22px', width: 104, height: 3, background: 'var(--lp-cream)', opacity: .74 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 14, flexWrap: 'wrap', minWidth: 0 },
  headerText: { minWidth: 0, display: 'grid', gap: 6, flex: '1 1 320px' },
  title: { margin: '10px 0 0', fontSize: 'clamp(1.55rem, 2.5vw, 2.55rem)', lineHeight: .98, letterSpacing: '-.045em' },
  muted: { margin: 0, maxWidth: 760, color: 'var(--lp-text-soft)', fontSize: 14, lineHeight: 1.45 },
  pager: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.075)' },
  pageButton: { width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 999, color: 'var(--lp-bg-deep)', cursor: 'pointer', ...glassCreamSurface },
  pageLabel: { minWidth: 64, textAlign: 'center', color: 'var(--lp-text-soft)', fontSize: 13 },
  heroRow: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px 12px', padding: '4px 2px 2px', minWidth: 0 },
  heroNumber: { color: 'var(--lp-text)', fontSize: 'clamp(28px, 3.4vw, 38px)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1 },
  heroUnit: { color: 'var(--lp-text-soft)', fontSize: 13, fontWeight: 700, textTransform: 'lowercase', letterSpacing: '.02em' },
  heroDivider: { display: 'inline-block', width: 1, height: 18, background: 'rgba(255,255,255,.16)', margin: '0 4px', alignSelf: 'center' },
  heroCaption: { color: 'var(--lp-muted)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' },
  heroCaptionStrong: { color: 'var(--lp-text-soft)', fontWeight: 760 },
  heroPlus: { color: 'var(--lp-muted)', margin: '0 1px' },
  heroDot: { color: 'rgba(255,255,255,.32)' },
  heroArtifact: { fontFamily: 'var(--lp-mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11.5, color: 'var(--lp-text-soft)', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.075)', borderRadius: 6, padding: '2px 6px' },
  matchedNote: { margin: 0, color: 'var(--lp-text-soft)', fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 999, background: 'rgba(215,209,176,.08)', border: '1px solid rgba(215,209,176,.18)', alignSelf: 'start', justifySelf: 'start' },
  matchedNoteStrong: { color: 'var(--lp-text)', fontWeight: 800 },
  controls: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  splitGroup: { display: 'inline-flex', padding: 4, gap: 2, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' },
  splitOption: { borderRadius: 999, padding: '.42rem .9rem', color: 'var(--lp-text-soft)', fontWeight: 700, fontSize: 12.5, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', transition: 'color 180ms ease, background 180ms ease, border-color 180ms ease' },
  splitOptionActive: { color: 'var(--lp-bg-deep)', ...glassCreamSurface },
  sortLabel: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--lp-muted)', fontSize: 12, fontWeight: 700 },
  sortLabelText: { textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--lp-muted)', fontSize: 11 },
  sortSelect: { borderRadius: 999, padding: '.46rem .68rem', color: 'var(--lp-text-soft)', fontWeight: 700, fontSize: 12.5, ...glassControlSurface },
  error: { margin: 0, color: '#E05A4F', border: '1px solid rgba(224,90,79,.3)', borderRadius: 16, padding: 10, background: 'rgba(224,90,79,.1)' },
  tableFrame: { overflowX: 'auto' },
  table: { width: '100%', minWidth: 1320, borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: { color: 'var(--lp-muted)', textAlign: 'left', padding: '8px 9px', fontSize: 11, borderBottom: '1px solid rgba(215,209,176,.14)', textTransform: 'none', letterSpacing: '.01em' },
  td: { color: 'var(--lp-text-soft)', padding: '7px 9px', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,.06)', verticalAlign: 'middle', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis' },
  row: { cursor: 'pointer', background: 'transparent' },
  selectedRow: { background: 'rgba(215,209,176,.14)', outline: '1px solid rgba(215,209,176,.42)' },
  oneLine: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--lp-text)', maxWidth: '100%' },
  subLine: { display: 'block', marginTop: 3, color: 'var(--lp-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  riskPill: { display: 'inline-flex', justifyContent: 'center', minWidth: 84, border: '1px solid', borderRadius: 999, padding: '.28rem .46rem', fontWeight: 760, fontSize: 10.5 },
  probWrap: { position: 'relative', display: 'block', height: 20, minWidth: 78, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(215,209,176,.16)' },
  probBar: { position: 'absolute', inset: '0 auto 0 0', background: 'var(--lp-cream)' },
  splitChip: { display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '.25rem .5rem', fontWeight: 900, fontSize: 10 },
  regionChip: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--lp-text-soft)', fontWeight: 760 },
  heldoutChip: { color: '#4FA66A', background: 'rgba(79,166,106,.14)', borderColor: 'rgba(79,166,106,.34)' },
  trainChip: { color: 'var(--lp-bg-deep)', background: 'rgba(215,209,176,.1)', borderColor: 'rgba(215,209,176,.26)' },
  detail: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12, alignItems: 'center', border: '1px solid rgba(215,209,176,.22)', borderRadius: 'var(--lp-radius-md)', padding: 12, background: 'rgba(255,255,255,.035)', minWidth: 0 },
  detailTitle: { margin: '7px 0 3px', fontSize: 16, lineHeight: 1.15 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, minWidth: 0 },
  detailItem: { display: 'grid', gap: 3, padding: 9, borderRadius: 14, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.075)' },
  detailNote: { gridColumn: '1 / -1', margin: 0, color: 'var(--lp-text-soft)' },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--lp-text-soft)', fontSize: 11 },
  safeChip: { display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.3 },
  guardrail: { color: 'var(--lp-bg-deep)', margin: 0 },
  emptyState: { padding: 18, textAlign: 'center', color: 'var(--lp-muted)', borderBottom: '1px solid rgba(255,255,255,.06)' },
  paginationBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0 4px' },
  paginationInfo: { fontSize: 12, color: 'var(--lp-muted)' },
  paginationControls: { display: 'flex', alignItems: 'center', gap: 4 },
  paginationBtn: { minWidth: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: 'var(--lp-text-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .15s, border-color .15s' },
  paginationBtnActive: { background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', borderColor: 'var(--lp-cream)', fontWeight: 900 },
  paginationEllipsis: { padding: '0 6px', color: 'var(--lp-muted)', fontSize: 14 },
};
