import type { CSSProperties } from 'react';
import { CheckCircle2, MessageSquareText } from 'lucide-react';
import type { CasebookPayload } from '../../types/api';
import { glassCreamIcon } from '../shared/glassStyles';

export function RiskStoryRail({ casebook }: { casebook: CasebookPayload }) {
  const brief = casebook.explanation_brief;
  const narrative = casebook.narrative.trim() || 'No generated narrative is available for this sample. Use the score and factor list as the starting point for reviewer triage.';
  return (
    <div style={styles.rail}>
      <section className="card" style={styles.card}>
        <div style={styles.sectionHeader}>
          <span style={styles.icon}><MessageSquareText size={16} /></span>
          <div>
            <p style={styles.eyebrow}>{brief ? 'Auditor brief' : 'Narrative'}</p>
            <h2 style={styles.title}>{brief ? 'Why this case is prioritized' : 'Review context'}</h2>
          </div>
        </div>
        {brief ? (
          <div style={styles.briefStack}>
            <span style={styles.confidenceBadge}>{brief.confidence_label}</span>
            <p style={styles.narrative}>{brief.summary}</p>
            <p style={styles.briefNote}>{brief.model_interpretation}</p>
            <p style={styles.shapNote}>{brief.shap_note}</p>
          </div>
        ) : (
          <p style={styles.narrative}>{narrative}</p>
        )}
      </section>
    </div>
  );
}

export function RiskSignalsToVerify({ casebook }: { casebook: CasebookPayload }) {
  const brief = casebook.explanation_brief;
  if (!brief) return null;

  const topDrivers = brief.top_drivers ?? [];
  const riskReducers = brief.risk_reducers ?? [];
  const briefSignals = [
    ...topDrivers.map((driver) => ({ driver, tone: 'up' as const })),
    ...riskReducers.map((driver) => ({ driver, tone: 'down' as const })),
  ];
  const usedFeatures = new Set(briefSignals.map(({ driver }) => driver.feature));
  const fallbackSignals = casebook.factors
    .filter((factor) => !usedFeatures.has(factor.feature))
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, Math.max(0, 5 - briefSignals.length))
    .map((factor) => {
      const tone = factor.shap_value >= 0 ? 'up' as const : 'down' as const;
      return {
        tone,
        driver: {
          feature: factor.feature,
          title: factor.feature_label,
          human_label: factor.feature_label,
          value_display: String(factor.value),
          shap_value: factor.shap_value,
          impact_label: getImpactLabel(factor.shap_value),
          direction: factor.direction,
          direction_label: tone === 'up' ? 'Menaikkan prioritas review' : 'Menurunkan prioritas review',
          reason: `${factor.feature_label} ikut menggeser skor model dan perlu dibaca bersama dokumen paket.`,
          reviewer_check: 'Verifikasi nilai fitur ini terhadap dokumen LPSE/kontrak dan konteks administratif paket.',
        },
      };
    });
  const signals = [...briefSignals, ...fallbackSignals];

  return (
    <section className="card signal-flow-panel" style={styles.signalFlowPanel} aria-label="Model explanation signals to verify flow">
      <div style={styles.sectionHeader}>
        <span style={styles.icon}><CheckCircle2 size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <p style={styles.eyebrow}>Model explanation</p>
          <h2 style={styles.title}>Signals to verify</h2>
        </div>
        <span style={styles.confidenceBadge}>{brief.confidence_label}</span>
      </div>
      <div style={styles.signalExplanation}>
        <p style={styles.narrative}>{brief.summary}</p>
        <p style={styles.briefNote}>{brief.model_interpretation}</p>
        <p style={styles.shapNote}>{brief.shap_note}</p>
      </div>
      <div className={`signal-flow-stack signal-flow-stack--count-${Math.min(signals.length, 5)}`} style={styles.signalFlowStack}>
        {signals.map(({ driver, tone }, index) => (
          <DriverCard
            key={`${tone}-${driver.feature}`}
            driver={driver}
            tone={tone}
            stage={index + 1}
            totalStages={signals.length}
          />
        ))}
        {signals.length === 0 && <p style={styles.briefNote}>Top factors are available in the SHAP bar chart.</p>}
      </div>
    </section>
  );
}

function getImpactLabel(shapValue: number) {
  const impact = Math.abs(shapValue);
  if (impact >= 0.25) return 'dampak kuat';
  if (impact >= 0.1) return 'dampak sedang';
  return 'dampak kecil';
}

function DriverCard({
  driver,
  tone,
  stage,
  totalStages,
}: {
  driver: NonNullable<CasebookPayload['explanation_brief']>['top_drivers'][number];
  tone: 'up' | 'down';
  stage: number;
  totalStages: number;
}) {
  const stageLabel = tone === 'up' ? (stage === 1 ? 'Strongest driver' : 'Risk driver') : 'Risk reducer';

  return (
    <article
      className={`signal-flow-card signal-flow-card--${tone} signal-flow-card--stage-${stage}`}
      style={{ ...styles.driverCard, animationDelay: `${(stage - 1) * 90}ms` }}
      aria-label={`Signal stage ${stage} of ${totalStages}`}
      tabIndex={0}
    >
      <header style={styles.driverHead}>
        <span className="signal-flow-card__node" style={styles.signalNode} aria-hidden="true">
          {String(stage).padStart(2, '0')}
        </span>
        <span style={styles.stageLabel}>{stageLabel}</span>
        <span style={{ ...styles.impactPill, ...(tone === 'up' ? styles.impactPillUp : styles.impactPillDown) }}>{driver.impact_label}</span>
      </header>
      <strong style={styles.driverTitle}>{driver.title}</strong>
      <p style={styles.driverReason}>{driver.reason}</p>
      <div style={styles.driverCheck}>
        <span style={styles.checkLabel}>Checklist</span>
        <p style={styles.checkText}>{driver.reviewer_check}</p>
      </div>
      <dl style={styles.driverMeta}>
        <div style={styles.metaItem}>
          <dt style={styles.metaLabel}>Feature</dt>
          <dd style={styles.metaValue}>{driver.feature}</dd>
        </div>
        <div style={styles.metaItem}>
          <dt style={styles.metaLabel}>Value</dt>
          <dd style={styles.metaValue}>{driver.value_display}</dd>
        </div>
        <div style={styles.metaItem}>
          <dt style={styles.metaLabel}>SHAP</dt>
          <dd style={styles.metaValue}>{driver.shap_value.toLocaleString('id-ID', { maximumFractionDigits: 3 })}</dd>
        </div>
      </dl>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  rail: { display: 'grid', gap: 12 },
  card: { padding: 18, display: 'grid', gap: 14, background: 'var(--lp-panel)' },
  sectionHeader: { display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' },
  icon: { display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 14, color: 'var(--lp-bg-deep)', ...glassCreamIcon },
  eyebrow: { margin: '0 0 4px', color: 'var(--lp-cream)', fontSize: '.76rem', fontWeight: 820, letterSpacing: '.02em' },
  title: { margin: 0, fontSize: '1rem', lineHeight: 1.16, letterSpacing: '-.02em' },
  narrative: { whiteSpace: 'pre-wrap', color: 'var(--lp-text-soft)', lineHeight: 1.62, margin: 0 },
  briefStack: { display: 'grid', gap: 10 },
  confidenceBadge: {
    display: 'inline-flex',
    width: 'fit-content',
    padding: '6px 10px',
    borderRadius: 999,
    color: 'var(--lp-bg-deep)',
    fontSize: '.72rem',
    fontWeight: 820,
    letterSpacing: '.01em',
    whiteSpace: 'nowrap',
    ...glassCreamIcon,
  },
  briefNote: { color: 'var(--lp-muted)', lineHeight: 1.5, margin: 0 },
  shapNote: { color: '#d9c89f', lineHeight: 1.5, margin: 0, paddingTop: 10, borderTop: '1px solid var(--lp-line)' },
  shapExplainerCard: { padding: 16, display: 'grid', gap: 6, borderColor: 'rgba(215,209,176,.24)', background: 'rgba(215,209,176,.08)' },
  shapExplainer: { color: 'var(--lp-text-soft)', lineHeight: 1.5, margin: 0 },
  signalFlowPanel: {
    padding: 18,
    display: 'grid',
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--lp-panel)',
  },
  signalExplanation: {
    display: 'grid',
    gap: 8,
    padding: '14px 16px',
    border: '1px solid var(--lp-line)',
    borderRadius: 14,
    background: 'rgba(255,255,255,.03)',
  },
  signalFlowStack: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, position: 'relative' },
  driverCard: {
    display: 'grid',
    gap: 10,
    padding: 14,
    border: '1px solid var(--lp-line)',
    borderRadius: 14,
    background: 'rgba(255,255,255,.03)',
    minWidth: 0,
  },
  driverHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  signalNode: {
    display: 'inline-grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    borderRadius: 12,
    color: 'var(--lp-bg-deep)',
    fontSize: '.72rem',
    fontWeight: 860,
    letterSpacing: '-.02em',
    flex: '0 0 auto',
    ...glassCreamIcon,
  },
  stageLabel: {
    color: '#d9c89f',
    fontSize: '.66rem',
    fontWeight: 820,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    flex: '1 1 auto',
    minWidth: 0,
  },
  driverTitle: {
    color: 'var(--lp-text)',
    lineHeight: 1.22,
    fontSize: '.98rem',
    letterSpacing: '-.01em',
    overflowWrap: 'anywhere',
  },
  impactPill: {
    flex: '0 0 auto',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: '.62rem',
    fontWeight: 820,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    border: '1px solid currentColor',
    whiteSpace: 'nowrap',
  },
  impactPillUp: { color: '#ff8a7d', background: 'rgba(224,90,79,.12)' },
  impactPillDown: { color: '#80d799', background: 'rgba(79,166,106,.13)' },
  driverReason: { color: 'var(--lp-text-soft)', lineHeight: 1.45, margin: 0, fontSize: '.88rem' },
  driverCheck: {
    display: 'grid',
    gap: 4,
    margin: 0,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid var(--lp-line)',
    background: 'rgba(255,255,255,.025)',
  },
  checkLabel: { color: '#d9c89f', fontSize: '.66rem', fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.07em' },
  checkText: { color: 'var(--lp-text-soft)', lineHeight: 1.45, margin: 0, fontSize: '.86rem' },
  driverMeta: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: 0, color: 'var(--lp-muted)', overflowWrap: 'anywhere' },
  metaItem: { display: 'inline-flex', gap: 5, alignItems: 'baseline', padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,.045)' },
  metaLabel: { color: 'var(--lp-muted)', fontSize: '.64rem', fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.05em' },
  metaValue: { margin: 0, color: 'var(--lp-text-soft)', fontSize: '.74rem', fontWeight: 720 },
  questionList: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 9 },
  questionItem: { display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: 10, alignItems: 'start', paddingTop: 10, borderTop: '1px solid var(--lp-line)' },
  questionIndex: { display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 999, color: 'var(--lp-bg-deep)', fontWeight: 860, fontSize: '.78rem', ...glassCreamIcon },
  questionText: { color: 'var(--lp-text-soft)', lineHeight: 1.45 },
};
