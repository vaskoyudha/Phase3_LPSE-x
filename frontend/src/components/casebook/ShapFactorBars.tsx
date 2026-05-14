import type { CSSProperties } from 'react';
import type { CasebookPayload } from '../../types/api';
import { glassCreamIcon } from '../shared/glassStyles';

const axisLabelStyle: CSSProperties = { fontSize: '.76rem', color: 'var(--lp-muted)', fontWeight: 800 };

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3).replace('.', ',')}`;
}

function formatValue(value: number) {
  return value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

function barColor(value: number) {
  if (value < 0) return 'var(--lp-emerald)';
  if (value < 0.16) return 'var(--lp-amber)';
  return 'var(--lp-red)';
}

function impactLabel(value: number) {
  return value >= 0 ? 'Menaikkan prioritas review' : 'Menurunkan prioritas review';
}

function impactStrength(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude >= 3) return 'Dampak sangat kuat';
  if (magnitude >= 1) return 'Dampak kuat';
  if (magnitude >= 0.25) return 'Dampak sedang';
  return 'Dampak kecil';
}

export function ShapFactorBars({ factors, title = 'Mengapa paket ini diprioritaskan untuk review' }: { factors: CasebookPayload['factors']; title?: string }) {
  const maxAbs = Math.max(0.0001, ...factors.map((factor) => Math.abs(factor.shap_value)));

  return (
    <section className="card" style={styles.card}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Model drivers</p>
          <h2 style={styles.title}>{title}</h2>
        </div>
        <div style={styles.summaryBox}>
          <strong>Apa arti SHAP?</strong>
          <p style={styles.summary}>SHAP menunjukkan faktor mana yang menggeser skor model naik atau turun dari baseline. Ini membantu prioritas review, bukan bukti pelanggaran.</p>
        </div>
      </div>

      <div style={styles.list}>
        {factors.map((factor, index) => {
          const pct = Math.min(50, (Math.abs(factor.shap_value) / maxAbs) * 50);
          const positive = factor.shap_value >= 0;
          return (
            <article
              className="casebook-factor-item"
              key={factor.feature}
              style={{ ...styles.factorItem, animationDelay: `${index * 55}ms` }}
            >
              <div style={styles.factorCopy}>
                <span style={styles.index}>{index + 1}</span>
                <div style={styles.factorText}>
                  <strong style={styles.factorLabel}>{factor.feature_label}</strong>
                  <span style={styles.factorMeta}>Nilai fitur {formatValue(factor.value)} · teknis: {factor.feature}</span>
                </div>
              </div>

              <div style={styles.factorImpact}>
                <div style={styles.impactRow}>
                  <span style={{ ...styles.impactLabel, color: positive ? '#E05A4F' : '#4FA66A' }}>{impactStrength(factor.shap_value)} · {impactLabel(factor.shap_value)}</span>
                  <code style={styles.signedValue}>{formatSigned(factor.shap_value)}</code>
                </div>
                <div aria-label="zero-axis signed contribution" style={styles.axis}>
                  <span style={styles.axisZero} />
                  <span
                    style={{
                      ...styles.axisFill,
                      left: positive ? '50%' : `${50 - pct}%`,
                      width: `${pct}%`,
                      background: barColor(factor.shap_value),
                    }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div style={styles.axisLegend}>
        <span style={{ ...axisLabelStyle, textAlign: 'right', color: '#4FA66A' }}>← Menurunkan Prioritas Review</span>
        <span style={{ ...axisLabelStyle, color: '#E05A4F' }}>Meningkatkan Prioritas Review →</span>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { padding: 20, minWidth: 0, display: 'grid', gap: 16, background: 'var(--lp-panel)' },
  header: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, .56fr)', gap: 14, alignItems: 'start' },
  eyebrow: { margin: '0 0 6px', color: 'var(--lp-cream)', fontSize: '.78rem', fontWeight: 820, letterSpacing: '.02em' },
  title: { margin: 0, fontSize: 'clamp(1.08rem, 1.4vw, 1.3rem)', lineHeight: 1.12, letterSpacing: '-.025em', textWrap: 'balance' },
  summaryBox: { display: 'grid', gap: 5, color: 'var(--lp-text-soft)' },
  summary: { margin: 0, color: 'var(--lp-muted)', lineHeight: 1.5, fontSize: '.86rem' },
  list: { display: 'grid', gap: 10 },
  factorItem: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
    gap: 14,
    alignItems: 'center',
    padding: '14px 0',
    borderTop: '1px solid var(--lp-line)',
  },
  factorCopy: { display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: 12, alignItems: 'start', minWidth: 0 },
  index: { display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 999, fontWeight: 860, color: 'var(--lp-bg-deep)', ...glassCreamIcon },
  factorText: { minWidth: 0, display: 'grid', gap: 4 },
  factorLabel: { color: 'var(--lp-text)', lineHeight: 1.22, overflowWrap: 'anywhere' },
  factorMeta: { color: 'var(--lp-muted)', fontSize: '.78rem', overflowWrap: 'anywhere' },
  factorImpact: { minWidth: 0, display: 'grid', gap: 8 },
  impactRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  impactLabel: { fontWeight: 760, fontSize: '.82rem' },
  signedValue: { color: 'var(--lp-text-soft)', fontSize: '.8rem' },
  axis: { position: 'relative', height: 28, borderRadius: 999, background: 'rgba(96,91,81,.16)', overflow: 'hidden' },
  axisZero: { position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, borderLeft: '1px dashed rgba(215,209,176,.55)' },
  axisFill: { position: 'absolute', top: 5, bottom: 5, borderRadius: 999, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)' },
  axisLegend: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: -2 },
};
