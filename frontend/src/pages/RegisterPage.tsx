import { useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, BadgeCheck, Building2, Eye, EyeOff, KeyRound, Mail, ShieldCheck, User, UserPlus } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { authStyles as a } from './authStyles';

type RegisterPageProps = {
  onNavigate: (href: string) => void;
};

type StrengthLevel = { label: string; tone: string; ratio: number };

function passwordStrength(password: string): StrengthLevel {
  if (!password) return { label: 'Belum diisi', tone: 'var(--lp-muted)', ratio: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 1) return { label: 'Lemah', tone: 'var(--lp-red)', ratio: 0.25 };
  if (score === 2) return { label: 'Sedang', tone: 'var(--lp-amber)', ratio: 0.55 };
  if (score === 3) return { label: 'Kuat', tone: 'var(--lp-emerald)', ratio: 0.8 };
  return { label: 'Sangat kuat', tone: 'var(--lp-emerald)', ratio: 1 };
}

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  const [fullName, setFullName] = useState('');
  const [agency, setAgency] = useState('');
  const [email, setEmail] = useState('');
  const [auditorId, setAuditorId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedGuardrail, setAcceptedGuardrail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!fullName.trim()) return setError('Nama lengkap wajib diisi.');
    if (!agency.trim()) return setError('Institusi atau kementerian wajib diisi.');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError('Format email tidak valid. Contoh: auditor@lpse.go.id');
    }
    if (!auditorId.trim()) return setError('Auditor ID wajib diisi.');
    if (password.length < 8) return setError('Kata sandi minimal 8 karakter.');
    if (password !== confirmPassword) return setError('Konfirmasi kata sandi tidak cocok.');
    if (!acceptedGuardrail) return setError('Anda harus menyetujui guardrail human-review sebelum melanjutkan.');

    setSubmitting(true);
    try {
      const storage = window.localStorage;
      storage.setItem(
        'lpse-x:registration',
        JSON.stringify({
          fullName: fullName.trim(),
          agency: agency.trim(),
          email: email.trim(),
          auditorId: auditorId.trim(),
          createdAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore storage failure
    }
    window.setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
      window.setTimeout(() => onNavigate('/login'), 1100);
    }, 360);
  };

  return (
    <AuthLayout
      eyebrow="Daftar auditor"
      title="Create your"
      subtitle="auditor profile"
      description="Daftar profil lokal untuk membuka dashboard triase, casebook explainable, dan antrean review. Semua data tetap di perangkat Anda."
      onNavigate={onNavigate}
      footer={
        <span>
          Sudah memiliki akses? <button type="button" style={a.link} onClick={() => onNavigate('/login')}>Masuk di sini</button>
        </span>
      }
    >
      <header style={a.formHeader}>
        <h2 style={a.formTitle}>Buat akun auditor</h2>
        <p style={a.formSubtitle}>Profil ini hanya digunakan untuk demo lokal LPSE-X. Tidak ada data yang dikirim keluar.</p>
      </header>

      <form style={a.form} onSubmit={onSubmit} noValidate>
        {error && (
          <div style={a.errorBanner} role="alert">
            <AlertCircle size={16} style={{ marginTop: 2, flex: '0 0 auto' }} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div style={a.successBanner} role="status">
            <BadgeCheck size={16} style={{ marginTop: 2, flex: '0 0 auto' }} />
            <span>Profil auditor disiapkan. Mengarahkan ke halaman masuk...</span>
          </div>
        )}

        <div style={a.fieldRow}>
          <label style={a.field}>
            <span style={a.label}>Nama lengkap</span>
            <span style={a.inputWrap}>
              <span style={a.inputIcon}><User size={16} /></span>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nama auditor"
                style={a.input}
                required
              />
            </span>
          </label>

          <label style={a.field}>
            <span style={a.label}>Institusi</span>
            <span style={a.inputWrap}>
              <span style={a.inputIcon}><Building2 size={16} /></span>
              <input
                type="text"
                autoComplete="organization"
                value={agency}
                onChange={(event) => setAgency(event.target.value)}
                placeholder="LPSE / Kementerian"
                style={a.input}
                required
              />
            </span>
          </label>
        </div>

        <div style={a.fieldRow}>
          <label style={a.field}>
            <span style={a.label}>Email auditor</span>
            <span style={a.inputWrap}>
              <span style={a.inputIcon}><Mail size={16} /></span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="auditor@lpse.go.id"
                style={a.input}
                required
              />
            </span>
          </label>

          <label style={a.field}>
            <span style={a.label}>Auditor ID</span>
            <span style={a.inputWrap}>
              <span style={a.inputIcon}><BadgeCheck size={16} /></span>
              <input
                type="text"
                autoComplete="username"
                value={auditorId}
                onChange={(event) => setAuditorId(event.target.value)}
                placeholder="Mis. AUD-024"
                style={a.input}
                required
              />
            </span>
          </label>
        </div>

        <label style={a.field}>
          <span style={a.label}>Kata sandi</span>
          <span style={a.inputWrap}>
            <span style={a.inputIcon}><KeyRound size={16} /></span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 8 karakter"
              style={{ ...a.input, paddingRight: 96 }}
              required
              minLength={8}
            />
            <button
              type="button"
              style={a.passwordToggle}
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            >
              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showPassword ? 'Hide' : 'Show'}</span>
            </button>
          </span>
          <StrengthMeter strength={strength} />
        </label>

        <label style={a.field}>
          <span style={a.label}>Konfirmasi kata sandi</span>
          <span style={a.inputWrap}>
            <span style={a.inputIcon}><KeyRound size={16} /></span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Ulangi kata sandi"
              style={a.input}
              required
              minLength={8}
            />
          </span>
        </label>

        <label style={{ ...a.checkboxLabel, alignItems: 'flex-start', gap: 10, lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={acceptedGuardrail}
            onChange={(event) => setAcceptedGuardrail(event.target.checked)}
            style={{ ...a.checkbox, marginTop: 3 }}
          />
          <span>
            Saya memahami output LPSE-X adalah <strong style={{ color: 'var(--lp-cream)' }}>triase risiko</strong> dan prioritas review; bukan tuduhan pelanggaran, dan keputusan tetap melalui review manusia.
          </span>
        </label>

        <button type="submit" style={a.primaryButton} disabled={submitting}>
          <UserPlus size={16} />
          <span>{submitting ? 'Menyiapkan profil...' : 'Buat akun auditor'}</span>
        </button>

        <p style={{ ...a.hint, display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
          <ShieldCheck size={14} style={{ marginTop: 2, color: 'var(--lp-emerald)', flex: '0 0 auto' }} />
          <span>Disimpan secara lokal di perangkat ini sebagai bagian dari demo offline. Tidak ada panggilan cloud, tidak ada retraining.</span>
        </p>
      </form>
    </AuthLayout>
  );
}

function StrengthMeter({ strength }: { strength: StrengthLevel }) {
  return (
    <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(215, 209, 176, .08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.round(strength.ratio * 100)}%`,
            height: '100%',
            background: strength.tone,
            transition: 'width .25s ease, background .25s ease',
          }}
        />
      </div>
      <small style={{ color: strength.tone, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>
        Kekuatan kata sandi: {strength.label}
      </small>
    </div>
  );
}
