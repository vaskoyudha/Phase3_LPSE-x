import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, ShieldCheck, Lock, BarChart3, Users, FlaskConical } from 'lucide-react';
import type { DemoState } from '../types/api';
import { GuardrailBanner } from '../components/shared/GuardrailBanner';
import { StaticBundleStatus } from '../components/shared/StaticBundleStatus';

type LandingPageProps = {
  demoState: DemoState;
  onOpen: () => void;
  onOpenCasebook?: () => void;
  onNavigate?: (href: string) => void;
};

export function LandingPage({ demoState, onOpen, onOpenCasebook }: LandingPageProps) {
  const casebookAction = onOpenCasebook ?? onOpen;

  return (
    <main className="landing-shell" style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.title}>
            LPSE-X
            <span style={styles.titleAccent}>Command Center</span>
          </h1>
          <p style={styles.subtitle}>Explainable Procurement Risk Triage</p>
          <p style={styles.description}>
            From local procurement packages to one explainable review priority in seconds — using the accepted model artifact, offline data, and human-review guardrails.
          </p>
          <div style={styles.actions}>
            <button onClick={onOpen} style={styles.primaryBtn}>
              <ShieldCheck size={20} />
              <span>
                <strong style={{ display: 'block' }}>Open Command Center</strong>
                <small style={styles.btnHint}>Launch live dashboard</small>
              </span>
            </button>
            <button onClick={casebookAction} style={styles.secondaryBtn}>
              <BookOpen size={20} />
              <span>
                <strong style={{ display: 'block' }}>View Casebook Demo</strong>
                <small style={styles.btnHint}>See explainable dossier</small>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section style={styles.capSection}>
        <div style={styles.capGrid}>
          <CapabilityCard icon={<Lock size={20} />} title="Offline" desc="No internet required" />
          <CapabilityCard icon={<FlaskConical size={20} />} title="Single Model" desc={demoState.model_artifact ?? 'XGBoost artifact'} />
          <CapabilityCard icon={<BarChart3 size={20} />} title="SHAP Explainability" desc="Transparent by design" />
          <CapabilityCard icon={<Users size={20} />} title="Human Review" desc="Auditor in the loop" />
          <CapabilityCard icon={<ShieldCheck size={20} />} title="Anti-Leakage Split" desc="Scientifically preserved" />
        </div>
      </section>

      <section style={styles.valueSection}>
        <ValueCard number="1" title="Prioritize review" tone="#d7d1b0">
          Model scores rank procurement packages so auditors focus on the rows that need careful reading first.
        </ValueCard>
        <ValueCard number="2" title="Explain each score" tone="#ffffff">
          SHAP values show which signals moved a package into the review queue, written for human auditors.
        </ValueCard>
        <ValueCard number="3" title="Preserve the split" tone="#4FA66A">
          Offline inference, a fixed model artifact, no retraining during audit, and the anti-leakage split preserved.
        </ValueCard>
      </section>

      <footer style={styles.footer}>
        <GuardrailBanner guardrail={demoState.guardrail} />
        <div style={styles.statusRow}>
          <StaticBundleStatus demoState={demoState} />
          <span className="badge">Feature source: {demoState.feature_source ?? 'local split artifact'}</span>
        </div>
      </footer>
    </main>
  );
}
function CapabilityCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div style={styles.capCard}>
      <div style={styles.capIcon}>{icon}</div>
      <strong style={{ fontSize: 14, color: 'var(--lp-cream)' }}>{title}</strong>
      <small style={{ fontSize: 12, color: 'var(--lp-muted)', lineHeight: 1.4 }}>{desc}</small>
    </div>
  );
}

function ValueCard({ number, title, tone, children }: { number: string; title: string; tone: string; children: ReactNode }) {
  return (
    <article style={styles.valueCard}>
      <div style={{ ...styles.valueNumber, borderColor: `${tone}44`, color: tone }}>{number}</div>
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: tone, letterSpacing: '-.02em' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--lp-text-soft)', lineHeight: 1.7 }}>{children}</p>
        <span style={{ display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 700, color: `${tone}aa`, letterSpacing: '.04em', textTransform: 'uppercase' }}>Local • explainable • review-first</span>
      </div>
    </article>
  );
}



const styles: Record<string, CSSProperties> = {
  shell: {
    width: '100%',
    padding: '0 clamp(20px, 3vw, 40px) 48px',
    minHeight: '100dvh',
  },

  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    padding: '14px 0',
    marginBottom: 24,
    borderBottom: '1px solid var(--lp-line)',
    backdropFilter: 'blur(16px) saturate(1.2)',
    background: 'rgba(17, 16, 15, 0.8)',
  },
  navInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  navBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  navTitle: {
    fontSize: 22,
    letterSpacing: '-.04em',
    fontWeight: 900,
    color: 'var(--lp-cream)',
  },
  navLinks: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 32,
    alignItems: 'center',
  },
  navLink: {
    border: 'none',
    background: 'transparent',
    color: 'var(--lp-text-soft)',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    padding: '6px 0',
    cursor: 'pointer',
    transition: 'color .2s',
    letterSpacing: '-.01em',
  },
  navStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 24,
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid rgba(79, 166, 106, .3)',
    background: 'rgba(79, 166, 106, .08)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#4FA66A',
    boxShadow: '0 0 6px #4FA66A',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#4FA66A',
    letterSpacing: '.02em',
  },

  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 960px)',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 'clamp(620px, 56.2vw, 768px)',
    padding: 'clamp(32px, 4vw, 56px) 0',
    marginBottom: 56,
  },
  heroContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    textAlign: 'center',
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: 'fit-content',
    border: '1px solid rgba(215, 209, 176, .2)',
    color: 'var(--lp-gold)',
    borderRadius: 999,
    padding: '8px 16px',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(215, 209, 176, .06)',
    marginBottom: 28,
  },
  title: {
    margin: '0 0 16px',
    fontSize: 'clamp(3.2rem, 6vw, 5.5rem)',
    lineHeight: 0.92,
    letterSpacing: '-.06em',
    fontWeight: 900,
    fontFamily: 'var(--lp-font-display)',
    color: 'var(--lp-white)',
  },
  titleAccent: {
    display: 'block',
    background: 'linear-gradient(135deg, var(--lp-cream) 0%, var(--lp-gold) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 'clamp(1.2rem, 2vw, 1.6rem)',
    margin: '0 0 16px',
    color: 'var(--lp-text-soft)',
    letterSpacing: '-.03em',
    fontWeight: 600,
  },
  description: {
    maxWidth: '52ch',
    color: 'var(--lp-muted)',
    fontSize: 'clamp(0.95rem, 1.4vw, 1.1rem)',
    lineHeight: 1.75,
    margin: '0 auto 36px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    border: 'none',
    borderRadius: 16,
    padding: '16px 28px',
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 4px 24px rgba(235, 230, 201, .2), 0 1px 3px rgba(235, 230, 201, .3)',
    transition: 'transform .15s, box-shadow .15s',
    textAlign: 'left',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    border: '1px solid rgba(215, 209, 176, .22)',
    borderRadius: 16,
    padding: '16px 28px',
    background: 'rgba(215, 209, 176, .06)',
    color: 'var(--lp-text)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-color .2s, background .2s',
    textAlign: 'left',
  },
  btnHint: {
    display: 'block',
    marginTop: 3,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--lp-muted)',
    opacity: 0.7,
  },
  capSection: {
    marginBottom: 64,
  },
  capGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 14,
  },
  capCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '20px 18px',
    border: '1px solid var(--lp-line)',
    borderRadius: 18,
    background: 'rgba(32, 31, 30, .4)',
    transition: 'border-color .2s, background .2s',
  },
  capIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(215, 209, 176, .08)',
    border: '1px solid rgba(215, 209, 176, .15)',
    color: 'var(--lp-gold)',
    marginBottom: 4,
  },

  valueSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 18,
    marginBottom: 48,
  },
  valueCard: {
    display: 'flex',
    gap: 18,
    padding: '28px 24px',
    border: '1px solid var(--lp-line)',
    borderRadius: 22,
    background: 'rgba(32, 31, 30, .45)',
    backdropFilter: 'blur(8px)',
  },
  valueNumber: {
    flexShrink: 0,
    width: 48,
    height: 48,
    border: '1.5px solid',
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    fontSize: 20,
    fontWeight: 900,
    background: 'rgba(17, 16, 15, .6)',
  },

  footer: {
    marginTop: 24,
    paddingTop: 24,
    borderTop: '1px solid var(--lp-line)',
  },
  statusRow: {
    marginTop: 14,
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
};
