import { useEffect, useState, type CSSProperties } from 'react';
import { UserCircle, ShieldCheck, Briefcase, Buildings, MapPin, IdentificationBadge, Envelope, CalendarBlank, ArrowRight, SignOut } from '@phosphor-icons/react';
import { operatorProfile, operatorInitials, type OperatorProfile } from '../data/operatorProfile';

type ProfilePageProps = {
  onNavigate: (href: string) => void;
};

type AuthSession = {
  email?: string;
  at?: string;
};

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('lpse-x:auth') ?? window.sessionStorage.getItem('lpse-x:auth');
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function formatJoinDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatSessionTimestamp(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const profile: OperatorProfile = operatorProfile;
  const [session, setSession] = useState<AuthSession | null>(() => readSession());

  useEffect(() => {
    const refresh = () => setSession(readSession());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const onSignOut = () => {
    try {
      window.localStorage.removeItem('lpse-x:auth');
      window.sessionStorage.removeItem('lpse-x:auth');
    } catch {
      // ignore
    }
    setSession(null);
    onNavigate('/login');
  };

  const initials = operatorInitials(profile);
  const sessionEmail = session?.email ?? profile.email;
  const lastSignIn = formatSessionTimestamp(session?.at);

  return (
    <main className="page-shell" style={styles.shell} aria-labelledby="profile-title">
      <section className="card" style={styles.hero}>
        <div style={styles.heroCopy}>
          <span style={styles.eyebrow}>
            <ShieldCheck size={12} weight="fill" /> Operator profile
          </span>
          <h1 id="profile-title" style={styles.title}>{profile.name}</h1>
          <p style={styles.role}>{profile.role}</p>
          <p style={styles.description}>
            Profil auditor terhubung ke katalog operator LPSE-X. Identitas ini tampil di sidebar, dashboard rail, dan jejak review human-in-the-loop pada casebook.
          </p>
          <div style={styles.actions}>
            <button type="button" style={styles.primaryAction} onClick={() => onNavigate('/dashboard/overview')}>
              <Briefcase size={16} weight="fill" />
              <span>Buka Command Center</span>
              <ArrowRight size={14} weight="bold" />
            </button>
            <button type="button" style={styles.secondaryAction} onClick={() => onNavigate('/reviews')}>
              <ShieldCheck size={16} weight="fill" />
              <span>Lihat Review Desk</span>
            </button>
            <button type="button" style={styles.signOutAction} onClick={onSignOut}>
              <SignOut size={16} weight="fill" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
        <div style={styles.heroAvatar} aria-hidden="true">
          <span style={styles.avatarInitials}>{initials || <UserCircle size={48} weight="fill" />}</span>
        </div>
      </section>

      <section style={styles.grid}>
        <DetailCard icon={<IdentificationBadge size={16} weight="fill" />} label="Auditor ID" value={profile.auditorId} />
        <DetailCard icon={<Envelope size={16} weight="fill" />} label="Email" value={sessionEmail} mono />
        <DetailCard icon={<Buildings size={16} weight="fill" />} label="Institusi" value={profile.agency} />
        <DetailCard icon={<Briefcase size={16} weight="fill" />} label="Unit kerja" value={profile.unit} />
        <DetailCard icon={<MapPin size={16} weight="fill" />} label="Cakupan wilayah" value={profile.region} />
        <DetailCard icon={<CalendarBlank size={16} weight="fill" />} label="Bergabung sejak" value={formatJoinDate(profile.joinedAt)} />
      </section>

      <section className="card" style={styles.activityCard} aria-label="Activity & guardrail">
        <div>
          <span style={styles.eyebrow}>
            <ShieldCheck size={12} weight="fill" /> Guardrail scope
          </span>
          <p style={styles.guardrail}>{profile.guardrailScope}</p>
        </div>
        {lastSignIn && (
          <div style={styles.sessionBlock}>
            <small style={styles.sessionLabel}>Sesi terakhir</small>
            <strong style={styles.sessionValue}>{lastSignIn}</strong>
          </div>
        )}
      </section>
    </main>
  );
}

function DetailCard({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string | undefined; mono?: boolean }) {
  return (
    <article className="card" style={styles.detailCard}>
      <span style={styles.detailIcon} aria-hidden="true">{icon}</span>
      <span style={styles.detailCopy}>
        <small style={styles.detailLabel}>{label}</small>
        <strong style={{ ...styles.detailValue, ...(mono ? styles.detailValueMono : {}) }}>{value ?? '—'}</strong>
      </span>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    width: '100%',
    padding: '0 clamp(20px, 3vw, 40px) 48px',
    display: 'grid',
    gap: 18,
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 24,
    padding: 'clamp(20px, 3vw, 32px)',
  },
  heroCopy: {
    display: 'grid',
    gap: 10,
    minWidth: 0,
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: 'fit-content',
    border: '1px solid rgba(215, 209, 176, .2)',
    color: 'var(--lp-gold)',
    borderRadius: 999,
    padding: '6px 12px',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(215, 209, 176, .06)',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(2rem, 3.6vw, 2.6rem)',
    lineHeight: 1,
    letterSpacing: '-.04em',
    fontWeight: 900,
    color: 'var(--lp-text)',
  },
  role: {
    margin: 0,
    color: 'var(--lp-cream)',
    fontSize: 14,
    fontWeight: 720,
    letterSpacing: '-.01em',
  },
  description: {
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 14,
    lineHeight: 1.65,
    maxWidth: '60ch',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  primaryAction: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    border: '1px solid var(--lp-glass-cream-border)',
    borderRadius: 999,
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    fontWeight: 800,
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: 'var(--lp-glass-shadow-soft)',
  },
  secondaryAction: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    border: '1px solid var(--lp-glass-control-border)',
    borderRadius: 999,
    background: 'var(--lp-glass-control)',
    color: 'var(--lp-cream-soft)',
    fontWeight: 720,
    fontSize: 13,
    cursor: 'pointer',
    backdropFilter: 'blur(14px) saturate(1.08)',
    WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
  },
  signOutAction: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    border: '1px solid rgba(224, 90, 79, .38)',
    borderRadius: 999,
    background: 'rgba(224, 90, 79, .12)',
    color: '#f1a39c',
    fontWeight: 720,
    fontSize: 13,
    cursor: 'pointer',
  },
  heroAvatar: {
    width: 132,
    height: 132,
    border: '1px solid var(--lp-glass-cream-border)',
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    display: 'grid',
    placeItems: 'center',
    boxShadow: '0 18px 38px rgba(17, 16, 15, 0.28)',
  },
  avatarInitials: {
    fontSize: 42,
    fontWeight: 900,
    letterSpacing: '-.04em',
    lineHeight: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
  },
  detailCard: {
    display: 'grid',
    gridTemplateColumns: '34px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'center',
    padding: 14,
  },
  detailIcon: {
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    border: '1px solid rgba(215, 209, 176, .18)',
    background: 'rgba(215, 209, 176, .08)',
    color: 'var(--lp-gold)',
  },
  detailCopy: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },
  detailLabel: {
    color: 'var(--lp-muted)',
    fontSize: 11,
    fontWeight: 760,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: 'var(--lp-text)',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '-.02em',
    overflowWrap: 'anywhere',
  },
  detailValueMono: {
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 13.5,
    letterSpacing: 0,
  },
  activityCard: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 16,
    alignItems: 'center',
    padding: 16,
  },
  guardrail: {
    margin: '8px 0 0',
    color: 'var(--lp-text-soft)',
    fontSize: 13.5,
    lineHeight: 1.6,
    maxWidth: '70ch',
  },
  sessionBlock: {
    display: 'grid',
    justifyItems: 'end',
    gap: 4,
    minWidth: 180,
    textAlign: 'right',
  },
  sessionLabel: {
    color: 'var(--lp-muted)',
    fontSize: 11,
    fontWeight: 760,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  sessionValue: {
    color: 'var(--lp-cream)',
    fontSize: 13,
    fontWeight: 720,
  },
};
