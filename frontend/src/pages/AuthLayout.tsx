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

/* ─── Node-and-edge abstract graph ─────────────────────────────────────────
   Full-page background decoration. Reuses existing CSS animation keyframes:
   lp-flow-node (pulse) and lp-flow-dash (edge dash).
   Colors come from existing tokens (cream / gold palette).
────────────────────────────────────────────────────────────────────────── */
const NODES = [
  { id: 'n1',  cx: 60,   cy: 80,  r: 7,  delay: '0ms'   },
  { id: 'n2',  cx: 220,  cy: 40,  r: 5,  delay: '200ms' },
  { id: 'n3',  cx: 420,  cy: 90,  r: 9,  delay: '400ms' },
  { id: 'n4',  cx: 680,  cy: 50,  r: 5,  delay: '600ms' },
  { id: 'n5',  cx: 900,  cy: 110, r: 7,  delay: '800ms' },
  { id: 'n6',  cx: 1100, cy: 60,  r: 5,  delay: '300ms' },
  { id: 'n7',  cx: 140,  cy: 220, r: 6,  delay: '500ms' },
  { id: 'n8',  cx: 340,  cy: 200, r: 10, delay: '700ms' },
  { id: 'n9',  cx: 560,  cy: 240, r: 7,  delay: '100ms' },
  { id: 'n10', cx: 780,  cy: 210, r: 5,  delay: '900ms' },
  { id: 'n11', cx: 1000, cy: 250, r: 8,  delay: '150ms' },
  { id: 'n12', cx: 1200, cy: 180, r: 5,  delay: '650ms' },
  { id: 'n13', cx: 50,   cy: 380, r: 5,  delay: '450ms' },
  { id: 'n14', cx: 240,  cy: 360, r: 7,  delay: '750ms' },
  { id: 'n15', cx: 460,  cy: 400, r: 5,  delay: '350ms' },
  { id: 'n16', cx: 660,  cy: 370, r: 9,  delay: '550ms' },
  { id: 'n17', cx: 880,  cy: 410, r: 6,  delay: '250ms' },
  { id: 'n18', cx: 1100, cy: 380, r: 5,  delay: '850ms' },
  { id: 'n19', cx: 160,  cy: 520, r: 6,  delay: '50ms'  },
  { id: 'n20', cx: 380,  cy: 540, r: 5,  delay: '950ms' },
  { id: 'n21', cx: 600,  cy: 510, r: 8,  delay: '420ms' },
  { id: 'n22', cx: 820,  cy: 550, r: 5,  delay: '620ms' },
  { id: 'n23', cx: 1040, cy: 520, r: 7,  delay: '820ms' },
  { id: 'n24', cx: 1220, cy: 490, r: 5,  delay: '120ms' },
] as const;

const EDGES = [
  ['n1','n2'],  ['n2','n3'],  ['n3','n4'],  ['n4','n5'],  ['n5','n6'],
  ['n1','n7'],  ['n2','n8'],  ['n3','n9'],  ['n4','n10'], ['n5','n11'], ['n6','n12'],
  ['n7','n8'],  ['n8','n9'],  ['n9','n10'], ['n10','n11'],['n11','n12'],
  ['n7','n13'], ['n8','n14'], ['n9','n15'], ['n10','n16'],['n11','n17'],['n12','n18'],
  ['n13','n14'],['n14','n15'],['n15','n16'],['n16','n17'],['n17','n18'],
  ['n13','n19'],['n14','n20'],['n15','n21'],['n16','n22'],['n17','n23'],['n18','n24'],
  ['n19','n20'],['n20','n21'],['n21','n22'],['n22','n23'],['n23','n24'],
  ['n2','n9'],  ['n8','n16'], ['n10','n21'],['n3','n8'],  ['n5','n16'],
] as const;

const nodeMap = Object.fromEntries(NODES.map(n => [n.id, n]));

function AuthGraphDecoration() {
  return (
    <svg
      viewBox="0 0 1280 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <radialGradient id="auth-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(235,230,201,0.5)" />
          <stop offset="100%" stopColor="rgba(235,230,201,0)" />
        </radialGradient>
        <filter id="auth-edge-blur">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Soft glow behind edges */}
      <g filter="url(#auth-edge-blur)" opacity="0.14">
        {EDGES.map(([a, b]) => {
          const na = nodeMap[a]; const nb = nodeMap[b];
          return (
            <line key={`glow-${a}-${b}`}
              x1={na.cx} y1={na.cy} x2={nb.cx} y2={nb.cy}
              stroke="rgba(235,230,201,0.9)" strokeWidth="8"
            />
          );
        })}
      </g>

      {/* Animated dashed edges */}
      {EDGES.map(([a, b], i) => {
        const na = nodeMap[a]; const nb = nodeMap[b];
        const len = Math.hypot(nb.cx - na.cx, nb.cy - na.cy);
        return (
          <line key={`edge-${a}-${b}`}
            x1={na.cx} y1={na.cy} x2={nb.cx} y2={nb.cy}
            stroke="rgba(215,209,176,0.22)"
            strokeWidth="1.2"
            strokeDasharray={`${len * 0.16} ${len * 0.14}`}
            strokeLinecap="round"
            style={{
              animation: `lp-flow-dash ${5 + (i % 5)}s linear infinite`,
              animationDelay: `${(i * 280) % 2400}ms`,
            }}
          />
        );
      })}

      {/* Node halos */}
      {NODES.map(n => (
        <circle key={`halo-${n.id}`}
          cx={n.cx} cy={n.cy} r={n.r * 4}
          fill="url(#auth-node-glow)"
          opacity="0.16"
          style={{
            animation: `lp-flow-node 3.2s ease-in-out infinite`,
            animationDelay: n.delay,
          }}
        />
      ))}

      {/* Nodes */}
      {NODES.map(n => (
        <circle key={n.id}
          cx={n.cx} cy={n.cy} r={n.r}
          fill="rgba(235,230,201,0.72)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
          style={{
            animation: `lp-flow-node 2.6s ease-in-out infinite`,
            animationDelay: n.delay,
            filter: 'drop-shadow(0 0 5px rgba(235,230,201,0.45))',
          }}
        />
      ))}
    </svg>
  );
}

export function AuthLayout({ eyebrow, title, subtitle, description, children, footer, onNavigate }: AuthLayoutProps) {
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate('/home');
  };

  return (
    <main className="landing-shell auth-shell" style={styles.shell} aria-labelledby="auth-title">
      {/* Full-page node graph background */}
      <div style={styles.graphBg} aria-hidden="true">
        <AuthGraphDecoration />
      </div>

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

      <section className="auth-shell__body" style={styles.body}>
        <aside className="auth-shell__preface" style={styles.preface} aria-hidden="true">
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
    position: 'relative',
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
    overflow: 'hidden',
    padding: '0 clamp(16px, 3vw, 40px)',
    display: 'flex',
    flexDirection: 'column',
  },
  graphBg: {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  topbar: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 0',
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
    minHeight: 0,
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.05fr) minmax(360px, 0.95fr)',
    gap: 'clamp(20px, 3vw, 48px)',
    alignItems: 'center',
    justifyItems: 'center',
    padding: '4px 0 12px',
  },
  preface: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 520,
    textAlign: 'center',
    margin: '0 auto',
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: 'fit-content',
    border: '1px solid rgba(215, 209, 176, .2)',
    color: 'var(--lp-gold)',
    borderRadius: 999,
    padding: '6px 14px',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(215, 209, 176, .06)',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(1.9rem, 3.4vw, 2.9rem)',
    lineHeight: 1,
    letterSpacing: '-.045em',
    fontWeight: 900,
    fontFamily: 'var(--lp-font-display)',
    color: 'var(--lp-white)',
  },
  titleAccent: {
    display: 'block',
    marginTop: 4,
    background: 'linear-gradient(135deg, var(--lp-cream) 0%, var(--lp-gold) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  description: {
    margin: '0 auto',
    color: 'var(--lp-muted)',
    fontSize: 'clamp(0.88rem, 1.1vw, 0.98rem)',
    lineHeight: 1.6,
    maxWidth: '44ch',
  },
  safeCopy: {
    margin: '0 auto',
    fontSize: 12,
    lineHeight: 1.55,
    maxWidth: '46ch',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: 'calc(100dvh - 80px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none' as const,
    border: '1px solid var(--lp-line)',
    borderRadius: 'var(--lp-radius-xl)',
    background: 'rgba(32, 31, 30, .82)',
    boxShadow: 'var(--lp-shadow)',
    backdropFilter: 'blur(20px) saturate(1.1)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
  },
  cardInner: {
    padding: 'clamp(18px, 2.4vw, 28px)',
  },
  cardFooter: {
    borderTop: '1px solid var(--lp-line)',
    padding: '14px clamp(18px, 2.4vw, 28px)',
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
