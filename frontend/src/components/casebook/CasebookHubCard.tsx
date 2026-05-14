import type { CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, CircleDot, Package, Sparkles } from 'lucide-react';
import type { CasebookPayload } from '../../types/api';
import { RiskChip } from '../shared/RiskChip';
import { glassCreamIcon } from '../shared/glassStyles';

function metadataValue(casebook: CasebookPayload, key: string, fallback = 'Tidak tersedia') {
  const value = casebook.metadata[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function CasebookHubCard({ casebook }: { casebook: CasebookPayload }) {
  const packageTitle = String(casebook.metadata.package_title ?? 'Selected procurement package');
  const buyer = metadataValue(casebook, 'buyer');
  const supplier = metadataValue(casebook, 'supplier');
  const tenderValue = metadataValue(casebook, 'tender_value_display');

  return (
    <section className="card casebook-hub-card" style={styles.card}>
      <div style={styles.header}>
        <div style={styles.headerCopy}>
          <p style={styles.eyebrow}>Tender hub</p>
          <h2 style={styles.title}>{packageTitle}</h2>
          <p style={styles.description}>
            Start from the package, follow the model signal, then land on the reviewer question that should be answered first.
          </p>
        </div>
        <div style={styles.headerMeta}>
          <RiskChip label={casebook.model_output.predicted_label} />
          <span style={styles.caseId}>{casebook.case_id}</span>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <article style={styles.heroCard}>
          <div style={styles.heroIcon}>
            <Package size={16} />
          </div>
          <div style={styles.heroCopy}>
            <span style={styles.heroLabel}>Tender focus</span>
            <strong style={styles.heroValue}>{tenderValue}</strong>
            <p style={styles.heroNote}>Buyer {buyer} · Supplier {supplier}</p>
          </div>
        </article>

        <article style={styles.sideCard}>
          <div style={styles.sideRow}>
            <span style={styles.sideIcon}><BadgeCheck size={14} /></span>
            <div>
              <span style={styles.sideLabel}>Model signal</span>
              <strong style={styles.sideValue}>{Math.round(casebook.model_output.probability * 100)}% review priority</strong>
            </div>
          </div>
          <div style={styles.sideRow}>
            <span style={styles.sideIcon}><Sparkles size={14} /></span>
            <div>
              <span style={styles.sideLabel}>Route</span>
              <strong style={styles.sideValue}>Context → signal → verify</strong>
            </div>
          </div>
        </article>
      </div>

      <div style={styles.flowRail}>
        <span style={styles.flowStep}>Context</span>
        <span className="casebook-hub-card__track" aria-hidden="true"><i /></span>
        <span style={styles.flowStep}>Signal</span>
        <span className="casebook-hub-card__track" aria-hidden="true"><i /></span>
        <span style={styles.flowStep}>Verify</span>
      </div>

      <div style={styles.callouts}>
        <div style={styles.callout}>
          <CircleDot size={14} />
          <span>Read the package first.</span>
        </div>
        <div style={styles.callout}>
          <ArrowRight size={14} />
          <span>Then inspect the strongest SHAP drivers.</span>
        </div>
        <div style={styles.callout}>
          <ArrowRight size={14} />
          <span>Finish with the reviewer questions.</span>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 18,
    display: 'grid',
    gap: 14,
    background: 'linear-gradient(180deg, rgba(42,41,39,.66), rgba(17,16,15,.56))',
    border: '1px solid rgba(235,230,201,.16)',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 16,
    alignItems: 'start',
  },
  headerCopy: { minWidth: 0 },
  eyebrow: { margin: 0, color: 'var(--lp-cream)', fontSize: 12, fontWeight: 820, letterSpacing: '.02em', textTransform: 'uppercase' },
  title: {
    margin: '6px 0 0',
    fontSize: 'clamp(1.2rem, 1.85vw, 1.7rem)',
    lineHeight: 1.02,
    letterSpacing: '-.04em',
    textWrap: 'balance',
  },
  description: { margin: '8px 0 0', color: 'var(--lp-muted)', lineHeight: 1.5, fontSize: '.88rem' },
  headerMeta: { display: 'grid', justifyItems: 'end', gap: 8 },
  caseId: {
    borderRadius: 999,
    padding: '.42rem .66rem',
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.06)',
    color: 'var(--lp-text-soft)',
    fontSize: '.76rem',
    fontWeight: 760,
    whiteSpace: 'nowrap',
  },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'stretch' },
  heroCard: {
    display: 'grid',
    gridTemplateColumns: '34px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    border: '1px solid rgba(215,209,176,.16)',
    background: 'rgba(255,255,255,.035)',
  },
  heroIcon: { display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 14, color: 'var(--lp-bg-deep)', ...glassCreamIcon },
  heroCopy: { minWidth: 0, display: 'grid', gap: 4 },
  heroLabel: { color: 'var(--lp-cream)', fontSize: '.72rem', fontWeight: 820, letterSpacing: '.04em', textTransform: 'uppercase' },
  heroValue: { color: 'var(--lp-text)', lineHeight: 1.2, fontSize: '1rem', letterSpacing: '-.02em', overflowWrap: 'anywhere' },
  heroNote: { margin: 0, color: 'var(--lp-muted)', lineHeight: 1.4, fontSize: '.8rem' },
  sideCard: {
    display: 'grid',
    gap: 10,
    alignContent: 'center',
    padding: 14,
    borderRadius: 20,
    border: '1px solid rgba(235,230,201,.12)',
    background: 'rgba(235,230,201,.06)',
  },
  sideRow: { display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', gap: 10, alignItems: 'start' },
  sideIcon: { display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 999, color: 'var(--lp-bg-deep)', ...glassCreamIcon },
  sideLabel: { display: 'block', color: 'var(--lp-muted)', fontSize: '.7rem', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' },
  sideValue: { display: 'block', color: 'var(--lp-text-soft)', lineHeight: 1.28, marginTop: 2, fontSize: '.82rem' },
  flowRail: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10,
  },
  flowStep: {
    borderRadius: 999,
    padding: '.45rem .78rem',
    border: '1px solid rgba(235,230,201,.2)',
    background: 'rgba(17,16,15,.46)',
    color: 'var(--lp-text-soft)',
    fontSize: '.76rem',
    fontWeight: 820,
    letterSpacing: '.02em',
    whiteSpace: 'nowrap',
  },
  callouts: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  callout: {
    display: 'grid',
    gridTemplateColumns: '16px minmax(0, 1fr)',
    gap: 8,
    alignItems: 'start',
    color: 'var(--lp-muted)',
    lineHeight: 1.35,
    fontSize: '.76rem',
    padding: '8px 10px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,.08)',
    background: 'rgba(255,255,255,.03)',
  },
};
