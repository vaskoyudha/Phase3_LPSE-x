import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, LogIn, Mail } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { authStyles as a } from './authStyles';
import { emitOperatorProfileChange } from '../data/useOperatorProfile';

type LoginPageProps = {
  onNavigate: (href: string) => void;
};

export function LoginPage({ onNavigate }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email auditor wajib diisi.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Format email tidak valid. Contoh: auditor@lpse.go.id');
      return;
    }
    if (password.length < 8) {
      setError('Kata sandi minimal 8 karakter.');
      return;
    }

    setSubmitting(true);
    // Local-only demo: persist a lightweight session marker and route to dashboard.
    try {
      const storage = remember ? window.localStorage : window.sessionStorage;
      storage.setItem('lpse-x:auth', JSON.stringify({ email: email.trim(), at: new Date().toISOString() }));
    } catch {
      // storage may be blocked; continue without persisting
    }
    emitOperatorProfileChange();
    window.setTimeout(() => {
      setSubmitting(false);
      onNavigate('/dashboard/overview');
    }, 320);
  };

  return (
    <AuthLayout
      eyebrow="Auditor sign-in"
      title="Welcome back"
      subtitle="to the audit floor"
      description="Sign in untuk membuka triase risiko offline, casebook explainable, dan antrean review yang menjaga split anti-leakage."
      onNavigate={onNavigate}
      footer={
        <span>
          Belum punya akses auditor? <button type="button" style={a.link} onClick={() => onNavigate('/register')}>Daftar di sini</button>
        </span>
      }
    >
      <header style={a.formHeader}>
        <h2 style={a.formTitle}>Sign in</h2>
        <p style={a.formSubtitle}>Gunakan kredensial demo lokal Anda. Tidak ada panggilan cloud yang dibuat.</p>
      </header>

      <form style={a.form} onSubmit={onSubmit} noValidate>
        {error && (
          <div style={a.errorBanner} role="alert">
            <AlertCircle size={16} style={{ marginTop: 2, flex: '0 0 auto' }} />
            <span>{error}</span>
          </div>
        )}

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
          <span style={a.label}>Kata sandi</span>
          <span style={a.inputWrap}>
            <span style={a.inputIcon}><KeyRound size={16} /></span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
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
        </label>

        <div style={a.optionRow}>
          <label style={a.checkboxLabel}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              style={a.checkbox}
            />
            Ingat saya di perangkat ini
          </label>
          <button type="button" style={a.link} onClick={() => onNavigate('/help')}>
            Lupa kata sandi?
          </button>
        </div>

        <button type="submit" style={a.primaryButton} disabled={submitting}>
          <LogIn size={16} />
          <span>{submitting ? 'Memverifikasi...' : 'Masuk ke Command Center'}</span>
        </button>

        <p style={a.hint}>
          Demo lokal: kredensial divalidasi di sisi klien dan disimpan untuk sesi audit. Tidak ada data yang dikirim ke layanan eksternal.
        </p>
      </form>
    </AuthLayout>
  );
}
