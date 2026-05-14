import { DatabaseZap } from 'lucide-react';
import type { CasebookPayload, DemoState } from '../../types/api';

export function ProvenanceDrawer({ demoState, casebook }: { demoState?: DemoState; casebook?: CasebookPayload }) {
  const provenance = casebook?.provenance;
  return (
    <details className="card" style={{ padding: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 8 }}>
        <DatabaseZap size={16} color="#c9c1b4" /> Provenance Drawer <small style={{ color: '#9d968a', fontWeight: 700 }}>offline evidence</small>
      </summary>
      <p style={{ color: 'var(--lp-muted)', margin: '8px 0', fontSize: 12 }}>No cloud dependency, no live scraping, no model retraining. Data is served from local split artifacts.</p>
      <ul style={{ lineHeight: 1.45, margin: 0, paddingLeft: 18, fontSize: 13 }}>
        <li>Model: {provenance?.model_artifact ?? demoState?.model_artifact ?? 'model_risk.ubj'}</li>
        <li>Feature source: {provenance?.feature_source ?? demoState?.feature_source}</li>
        <li>Raw source: {provenance?.raw_source ?? demoState?.raw_source}</li>
        <li>Split usage: {provenance?.split_usage ?? 'test_data demo/evaluasi lokal, bukan pelatihan atau tuning.'}</li>
      </ul>
    </details>
  );
}
