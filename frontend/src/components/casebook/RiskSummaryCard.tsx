import type { CSSProperties } from 'react';
import { BriefcaseBusiness, CalendarDays, FolderKanban, Scale, Users } from 'lucide-react';
import type { CasebookPayload } from '../../types/api';
import { RiskChip } from '../shared/RiskChip';
import { glassCreamIcon } from '../shared/glassStyles';

function metadataValue(casebook: CasebookPayload, key: string, fallback = 'Tidak tersedia') {
  const value = casebook.metadata[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function RiskSummaryCard({ casebook }: { casebook: CasebookPayload }) {
  const rows = [
    { label: 'Buyer', value: metadataValue(casebook, 'buyer'), icon: <BriefcaseBusiness size={14} /> },
    { label: 'Supplier', value: metadataValue(casebook, 'supplier'), icon: <Users size={14} /> },
    { label: 'Value', value: metadataValue(casebook, 'tender_value_display'), icon: <Scale size={14} /> },
    { label: 'Published', value: metadataValue(casebook, 'date_published'), icon: <CalendarDays size={14} /> },
    { label: 'Category', value: metadataValue(casebook, 'category'), icon: <FolderKanban size={14} /> },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={styles.riskCard}>
        <div style={styles.riskHeader}>
          <div>
            <p style={styles.eyebrow}>Risk summary</p>
            <RiskChip label={casebook.model_output.predicted_label} />
          </div>
          <span style={styles.priority}>#{casebook.model_output.risk_rank ?? '-'}</span>
        </div>
      </section>

      <section className="card" style={styles.metaCard}>
        <h2 style={styles.sectionTitle}>Package details</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <div key={row.label} style={styles.row}>
              <span style={styles.rowIcon}>{row.icon}</span>
              <span style={styles.rowLabel}>{row.label}</span>
              <strong style={styles.rowValue}>{row.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  riskCard: { padding: 18, display: 'grid', gap: 16, background: 'var(--lp-panel)' },
  riskHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 },
  eyebrow: { margin: '0 0 7px', color: 'var(--lp-cream)', fontSize: 12, fontWeight: 820, letterSpacing: '.02em' },
  priority: { borderRadius: 999, padding: '.42rem .62rem', color: 'var(--lp-bg-deep)', fontWeight: 880, ...glassCreamIcon },
  metaCard: { padding: 18, display: 'grid', gap: 12, background: 'var(--lp-panel)' },
  sectionTitle: { margin: 0, fontSize: 16, letterSpacing: '-.02em' },
  row: { display: 'grid', gridTemplateColumns: '24px 72px minmax(0, 1fr)', gap: 8, alignItems: 'start', padding: '9px 0', borderTop: '1px solid rgba(255,255,255,.07)' },
  rowIcon: { color: 'var(--lp-cream)', display: 'grid', placeItems: 'center' },
  rowLabel: { color: 'var(--lp-muted)', fontSize: 12 },
  rowValue: { color: 'var(--lp-text-soft)', lineHeight: 1.28, overflowWrap: 'anywhere', fontSize: 12.5 },
};
