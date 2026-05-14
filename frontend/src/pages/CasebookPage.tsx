import type { CSSProperties } from 'react';
import { ArrowLeft, Download, RotateCcw } from 'lucide-react';
import type { CasebookPayload } from '../types/api';
import { CasebookHubCard } from '../components/casebook/CasebookHubCard';
import { ShapFactorBars } from '../components/casebook/ShapFactorBars';
import { RiskSignalsToVerify, RiskStoryRail } from '../components/casebook/RiskStoryRail';
import { ProvenanceDrawer } from '../components/shared/ProvenanceDrawer';
import { ReviewDrawer } from '../components/reviews/ReviewDrawer';

export function CasebookPage({ casebook, exportUrl, onBack, reviewOpen = false }: { casebook: CasebookPayload; exportUrl: string; onBack: () => void; reviewOpen?: boolean }) {
  return (
    <main className="casebook-shell" style={styles.shell}>
      <div style={styles.actionRow}>
        <button onClick={onBack} type="button" style={styles.backButton}><ArrowLeft size={16} /> Back to Dashboard</button>
      </div>

      <div className="casebook-grid" style={styles.grid}>
        <section className="casebook-panel-in casebook-panel-in--main" style={styles.centerRail}>
          <CasebookHubCard casebook={casebook} />
          <ShapFactorBars factors={casebook.factors} title="Mengapa paket ini diprioritaskan untuk review" />
          <RiskSignalsToVerify casebook={casebook} />
        </section>
        <aside className="casebook-panel-in casebook-right" style={styles.rightRailColumn}>
          <div className="casebook-right__sticky" style={styles.rightRail}>
            {reviewOpen && <ReviewDrawer caseId={casebook.case_id} open={reviewOpen} />}
            <RiskStoryRail casebook={casebook} />
          </div>
        </aside>
      </div>

      <footer className="card" style={styles.footer}>
        <button onClick={onBack} type="button" style={styles.secondaryAction}><RotateCcw size={16} /> Return to Queue</button>
        <a href={exportUrl} target="_blank" rel="noreferrer" style={styles.primaryAction}><Download size={16} /> Export Casebook</a>
      </footer>

      <div style={styles.provenance}>
        <ProvenanceDrawer casebook={casebook} />
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    width: '100%',
    maxWidth: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 14,
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  backButton: {
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 999,
    background: 'rgba(255,255,255,.07)',
    color: 'var(--lp-text-soft)',
    padding: '.68rem .9rem',
    fontWeight: 780,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    whiteSpace: 'nowrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2.25fr) minmax(320px, .86fr)',
    gap: 14,
    alignItems: 'start',
    position: 'relative',
    isolation: 'isolate',
    borderRadius: 28,
    background: 'rgba(255,255,255,.018)',
  },
  centerRail: { minWidth: 0, display: 'grid', gap: 14, position: 'relative', zIndex: 1 },
  rightRailColumn: { minWidth: 0, position: 'relative', zIndex: 1 },
  rightRail: { minWidth: 0, display: 'grid', gap: 16, alignContent: 'start' },
  footer: {
    padding: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
    background: 'rgba(255,255,255,.035)',
  },
  secondaryAction: {
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 999,
    background: 'rgba(255,255,255,.07)',
    color: 'var(--lp-text-soft)',
    padding: '.78rem 1rem',
    fontWeight: 780,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  primaryAction: {
    borderRadius: 999,
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    padding: '.78rem 1rem',
    fontWeight: 820,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  provenance: { marginTop: 0 },
};
