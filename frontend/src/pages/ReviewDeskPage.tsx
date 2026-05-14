import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../api/client';
import type { ReviewListResponse, ReviewRecord, ReviewStatus } from '../types/api';
import { RiskChip } from '../components/shared/RiskChip';
import { glassSubtleSurface } from '../components/shared/glassStyles';

const defaultStatuses: ReviewStatus[] = ['Perlu Review', 'Sedang Direview', 'Butuh Bukti Tambahan', 'Ditandai Risiko', 'Clear / Tidak Prioritas', 'Selesai'];

export function ReviewDeskPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [reviews, setReviews] = useState<ReviewListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
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
  }, [search, status]);

  const statuses = reviews?.statuses ?? defaultStatuses;
  const total = useMemo(() => reviews?.items.length ?? 0, [reviews?.items.length]);

  return (
    <main className="review-desk-page" style={styles.shell}>
      <section className="card" style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Hybrid human sign-off</p>
          <h1 style={styles.title}>Package Review Desk</h1>
          <p style={styles.copy}>Kelola keputusan reviewer yang tersimpan lokal. Model menyiapkan rationale dan checklist; manusia memilih status final dan menandatangani catatan review.</p>
        </div>
        <div style={styles.totalCard} aria-label="Total package reviews">
          <span style={styles.bigNumber}>{total}</span>
          <span style={styles.smallLabel}>worklist entries</span>
        </div>
      </section>

      <section className="card" style={styles.toolbar}>
        <label style={styles.fieldLabel}>Search packages
          <input style={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buyer, supplier, package title" />
        </label>
        <label style={styles.fieldLabel}>Status
          <select style={styles.input} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </section>

      {error && <section className="card" role="alert" style={styles.error}>Review API failed: {error}</section>}

      <section style={styles.countGrid} aria-label="Review status counts">
        {statuses.map((item) => (
          <article key={item} className="card" style={styles.countCard}>
            <strong>{item}</strong>
            <span style={styles.countNumber}>{reviews?.counts[item] ?? 0}</span>
          </article>
        ))}
      </section>

      <section className="card" style={styles.tableCard} aria-label="Saved package review worklist">
        <div style={styles.tableHeader}>
          <h2 style={styles.sectionTitle}>Saved review worklist</h2>
          <p style={styles.safeCopy}>triase risiko · prioritas review · bukan tuduhan pelanggaran</p>
        </div>
        <div style={styles.rows}>
          {(reviews?.items ?? []).map((item) => (
            <ReviewDeskRow key={item.case_id} item={item} onNavigate={onNavigate} />
          ))}
          {reviews?.items.length === 0 && <p style={styles.copy}>No matching reviews yet.</p>}
          {!reviews && !error && <p style={styles.copy}>Loading local review database…</p>}
        </div>
      </section>
    </main>
  );
}

function ReviewDeskRow({ item, onNavigate }: { item: ReviewRecord; onNavigate: (href: string) => void }) {
  const title = String(item.package_snapshot.package_title ?? 'Untitled procurement package');
  const buyer = String(item.package_snapshot.buyer ?? '-');
  const riskLabel = String(item.model_snapshot.predicted_label ?? 'Risiko');
  const href = `/casebook/${encodeURIComponent(item.case_id)}?review=1`;
  return (
    <article style={styles.row}>
      <div style={styles.rowMain}>
        <div style={styles.rowTopline}>
          <RiskChip label={riskLabel} />
          <span className="badge">{item.is_saved ? 'Saved review' : 'Draft from casebook'}</span>
        </div>
        <h3 style={styles.rowTitle}>{title}</h3>
        <p style={styles.copy}>{buyer} · {item.case_id}</p>
      </div>
      <div style={styles.rowMeta}>
        <strong>{item.status}</strong>
        <span style={styles.safeCopy}>{item.reviewer_name || 'Unassigned reviewer'}</span>
      </div>
      <a
        href={href}
        style={styles.openLink}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(href);
        }}
      >
        Open review drawer
      </a>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: { display: 'grid', gap: 14 },
  hero: { padding: 18, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center', background: 'linear-gradient(135deg, rgba(224,90,79,.18), rgba(235,230,201,.08))' },
  eyebrow: { margin: 0, color: 'var(--lp-cream)', fontSize: 12, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.08em' },
  title: { margin: '5px 0 0', fontSize: 'clamp(2rem, 4vw, 4.4rem)', letterSpacing: '-.06em', lineHeight: .9 },
  copy: { margin: '6px 0 0', color: 'var(--lp-muted)', lineHeight: 1.55 },
  totalCard: { minWidth: 150, padding: 16, borderRadius: 24, border: '1px solid rgba(235,230,201,.18)', background: 'rgba(0,0,0,.18)', textAlign: 'right' },
  bigNumber: { display: 'block', fontSize: 42, fontWeight: 900, color: 'var(--lp-cream)' },
  smallLabel: { color: 'var(--lp-muted)', fontSize: 12, fontWeight: 750 },
  toolbar: { padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 240px', gap: 12 },
  fieldLabel: { color: 'var(--lp-text-soft)', fontWeight: 800, display: 'grid', gap: 7, fontSize: 13 },
  input: { width: '100%', borderRadius: 14, color: 'var(--lp-text)', padding: '.8rem .9rem', ...glassSubtleSurface },
  error: { padding: 14, color: '#FECACA', borderColor: 'rgba(248,113,113,.35)' },
  countGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 },
  countCard: { padding: 14, display: 'grid', gap: 8, minHeight: 92 },
  countNumber: { fontSize: 28, fontWeight: 900, color: 'var(--lp-cream)' },
  tableCard: { padding: 0, overflow: 'hidden' },
  tableHeader: { padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,.08)' },
  sectionTitle: { margin: 0, fontSize: 18 },
  safeCopy: { margin: 0, color: 'var(--lp-muted)', fontSize: 12 },
  rows: { display: 'grid' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(150px,.28fr) auto', gap: 14, alignItems: 'center', padding: 16, borderTop: '1px solid rgba(255,255,255,.06)' },
  rowMain: { minWidth: 0 },
  rowTopline: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  rowTitle: { margin: '8px 0 0', fontSize: 18, letterSpacing: '-.02em' },
  rowMeta: { display: 'grid', gap: 4 },
  openLink: { borderRadius: 999, padding: '.75rem .95rem', background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', textDecoration: 'none', fontWeight: 850, whiteSpace: 'nowrap' },
};
