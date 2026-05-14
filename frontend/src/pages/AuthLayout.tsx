import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../components/shared/BrandMark';

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onNavigate?: (href: string) => void;
};

export function AuthLayout({ eyebrow, title, subtitle, description, children, footer, onNavigate }: AuthLayoutProps) {
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate('/home');
  };

  return (
    <main className="landing-shell" style={styles.shell} aria-labelledby="auth-title">
      <header style={styles.topbar}>
        <a href="/home" onClick={goHome} style={styles.backLink} aria-label="Back to LPSE-X home">
          <ArrowLeft size={16} />
          <span>Back to home</span>
        </a>
        <div style={styles.brandLockup} aria-hidden="true">
          <BrandMark size={40} compact />
          <div>
            <p style={styles.brandSubtitle}>LPSE-X</p>
            <p style={styles.brandTitle}>Command Center</p>
          </div>
        </div>
      </header>

      <section style={styles.body}>
        <aside style={styles.preface} aria-hidden="true">
          <span style={styles.eyebrow}>
            <ShieldCheck size={12} /> {eyebrow}
          </span>
          <h1 id="auth-title" style={styles.title}>
            {title}
            <span style={styles.titleAccent}>{subtitle}</span>
          </h1>
          {description && <p style={styles.description}>{description}</p>}
          <p className="safe-copy" style={styles.safeCopy}>
            Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran, bukan putusan akhir, dan wajib ditinjau manusia.
          </p>
        </aside>

        <article style={styles.card}>
          <div style={styles.cardInner}>{children}</div>
          {footer && <div style={styles.cardFooter}>{footer}</div>}
        </article>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    width: '100%',
    minHeight: '100dvh',
    padding: '0 clamp(20px, 3vw, 40px) 48px',
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '18px 0',
    marginBottom: 16,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--lp-glass-control-border)',
    background: 'var(--lp-glass-control)',
    color: 'var(--lp-cream-soft)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '-.01em',
    backdropFilter: 'blur(14px) saturate(1.08)',
    WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
  },
  brandLockup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandSubtitle: {
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 11,
    letterSpacing: '.18em',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  brandTitle: {
    margin: '2px 0 0',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '-.03em',
    color: 'var(--lp-cream)',
  },
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 480px)',
    gap: 'clamp(28px, 4vw, 64px)',
    alignItems: 'center',
    padding: 'clamp(16px, 4vw, 48px) 0',
  },
  preface: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: 540,
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
  },
  title: {
    margin: 0,
    fontSize: 'clamp(2.4rem, 4.6vw, 3.8rem)',
    lineHeight: 0.96,
    letterSpacing: '-.05em',
    fontWeight: 900,
    fontFamily: 'var(--lp-font-display)',
    color: 'var(--lp-white)',
  },
  titleAccent: {
    display: 'block',
    marginTop: 6,
    background: 'linear-gradient(135deg, var(--lp-cream) 0%, var(--lp-gold) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  description: {
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 'clamp(0.95rem, 1.2vw, 1.05rem)',
    lineHeight: 1.7,
    maxWidth: '52ch',
  },
  safeCopy: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.65,
    maxWidth: '54ch',
  },
  card: {
    border: '1px solid var(--lp-line)',
    borderRadius: 'var(--lp-radius-xl)',
    background: 'rgba(32, 31, 30, .72)',
    boxShadow: 'var(--lp-shadow)',
    backdropFilter: 'blur(16px) saturate(1.1)',
    WebkitBackdropFilter: 'blur(16px) saturate(1.1)',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 'clamp(24px, 3vw, 36px)',
  },
  cardFooter: {
    borderTop: '1px solid var(--lp-line)',
    padding: '18px clamp(24px, 3vw, 36px)',
    background: 'rgba(17, 16, 15, .42)',
    color: 'var(--lp-muted)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
    textAlign: 'center',
  },
};
