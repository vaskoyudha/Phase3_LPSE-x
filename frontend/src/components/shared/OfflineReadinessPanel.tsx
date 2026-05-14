import type { DemoState } from '../../types/api';

export function OfflineReadinessPanel({ demoState }: { demoState: DemoState }) {
  const rows = [
    ['Offline mode', demoState.offline_mode ? 'Ready' : 'Check'],
    ['Model artifact', demoState.model_artifact ?? 'Unavailable'],
    ['Feature source', demoState.feature_source ?? 'Unavailable'],
    ['Raw source', demoState.raw_source ?? 'Unavailable'],
    ['Static bundle', demoState.production_build_status.dist_present ? 'Built' : 'Dev/API only'],
  ];
  return (
    <section className="card" style={{ padding: 18 }}>
      <h3 style={{ marginTop: 0 }}>Offline Readiness</h3>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--lp-line)', padding: '9px 0' }}>
          <span style={{ color: 'var(--lp-muted)' }}>{label}</span><strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
