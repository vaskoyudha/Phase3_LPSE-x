import type { CSSProperties, ReactNode } from 'react';
import { Database, Gauge, Stack } from '@phosphor-icons/react';
import { glassCreamIcon } from '../shared/glassStyles';
import type { InferenceStatus } from '../../types/api';

type Props = {
  id?: string;
  status?: InferenceStatus | null;
};

export function InferenceStatusCard({ id, status }: Props) {
  if (!status) {
    return (
      <section id={id} className="card" style={styles.card} aria-label="Inference status">
        <h2 style={styles.title}>Inference</h2>
        <p style={styles.muted}>Waiting for FastAPI metadata.</p>
      </section>
    );
  }

  const displayed = status.rows_displayed.toLocaleString('id-ID');
  const scored = status.rows_scored.toLocaleString('id-ID');
  const latencySeconds = (status.total_latency_ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 });

  return (
    <section id={id} className="card" style={styles.card} aria-label="Inference status">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Inference</h2>
        </div>
        <span style={styles.ready}><span style={styles.pulse} aria-hidden="true" /> Ready</span>
      </div>

      <div style={styles.metricGrid}>
        <Metric icon={<Database size={16} weight="fill" />} label="Rows scored" value={scored} />
        <Metric icon={<Stack size={16} weight="fill" />} label="Queue shown" value={`Top ${displayed}`} />
        <Metric icon={<Gauge size={16} weight="fill" />} label="Runtime" value={`${latencySeconds}s`} />
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span style={styles.metric}>
      <span style={styles.metricIcon}>{icon}</span>
      <span style={styles.metricText}>
        <small style={styles.metricLabel}>{label}</small>
        <strong style={styles.metricValue}>{value}</strong>
      </span>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 16,
    display: 'grid',
    gap: 11,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--lp-panel)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: { margin: '0 0 4px', color: 'var(--lp-cream)', fontSize: 11, fontWeight: 780, letterSpacing: '.01em' },
  ready: { display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--lp-text-soft)', fontSize: 11.5, fontWeight: 760 },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--lp-emerald)',
    boxShadow: '0 0 0 5px rgba(79,166,106,.16)',
  },
  title: { margin: 0, fontSize: 18, letterSpacing: '-.025em' },
  muted: { margin: 0, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.35 },
  metricGrid: { display: 'grid', gap: 7 },
  metric: {
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr)',
    gap: 8,
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.075)',
    borderRadius: 16,
    padding: '8px 9px',
    background: 'rgba(255,255,255,.035)',
    minWidth: 0,
  },
  metricIcon: { width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', ...glassCreamIcon },
  metricText: { minWidth: 0, display: 'grid', gap: 2, lineHeight: 1.05 },
  metricLabel: { color: 'var(--lp-muted)', fontSize: 11, whiteSpace: 'nowrap' },
  metricValue: { display: 'block', minWidth: 0, color: 'var(--lp-text)', fontSize: 15, overflowWrap: 'anywhere' },
};
