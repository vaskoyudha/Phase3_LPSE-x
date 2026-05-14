import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { ShapFactorBars } from '../components/casebook/ShapFactorBars';
import type { CasebookPayload, DemoState } from '../types/api';

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function probabilityTriplet(casebook: CasebookPayload) {
  const values = casebook.model_output.probabilities;
  if (values.length >= 3) return { low: values[0], medium: values[1], high: values[2] };
  return { low: 0, medium: Math.max(0, 1 - casebook.model_output.probability), high: casebook.model_output.probability };
}

function LoadingState({ message }: { message: string }) {
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <section className="card" style={{ padding: 24 }}>
        <h1>Model Transparency</h1>
        <p>{message}</p>
        <p className="safe-copy">Halaman ini menunggu data lokal; output tetap triase risiko untuk prioritas review, bukan tuduhan pelanggaran.</p>
      </section>
    </main>
  );
}

export function ModelTransparencyPage({ initialCasebook, initialDemoState }: { initialCasebook?: CasebookPayload; initialDemoState?: DemoState }) {
  const [casebook, setCasebook] = useState<CasebookPayload | null>(initialCasebook ?? null);
  const [demoState, setDemoState] = useState<DemoState | null>(initialDemoState ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCasebook) return;
    let cancelled = false;
    async function loadTransparencyData() {
      try {
        const demo = initialDemoState ?? await api.demoState();
        if (cancelled) return;
        setDemoState(demo);
        if (!demo.demo_case_id) {
          setError('Demo casebook belum tersedia dari API lokal.');
          return;
        }
        const payload = await api.casebook(demo.demo_case_id);
        if (!cancelled) setCasebook(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat transparansi model.');
      }
    }
    void loadTransparencyData();
    return () => { cancelled = true; };
  }, [initialCasebook, initialDemoState]);

  const probabilities = useMemo(() => casebook ? probabilityTriplet(casebook) : null, [casebook]);

  if (error && !casebook) return <LoadingState message={error} />;
  if (!casebook || !probabilities) return <LoadingState message="Memuat demo_state dan casebook lokal untuk transparansi model..." />;

  const probability = Math.round(casebook.model_output.probability * 100);
  const topPositive = [...casebook.factors].filter((factor) => factor.shap_value >= 0).sort((a, b) => b.shap_value - a.shap_value)[0];
  const lowering = casebook.factors.filter((factor) => factor.shap_value < 0).slice(0, 2);

  return (
    <main style={{ maxWidth: 1536, margin: '0 auto', padding: 18 }}>
      <header className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 18, padding: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Model Transparency</h1>
          <p style={{ margin: '4px 0 0', color: '#c9c1b4' }}>XGBoost + SHAP Explainability · {demoState?.model_artifact ?? casebook.provenance.model_artifact}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'end' }}>
          <span className="badge">Explainable AI</span>
          <span className="badge">Offline</span>
          <span className="badge" style={{ borderColor: 'rgba(79,166,106,.36)', color: '#4FA66A' }}>No Cloud</span>
          <span className="badge">Human-Readable</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr .95fr 1.05fr', gap: 18, alignItems: 'start' }}>
        <ShapFactorBars factors={casebook.factors} title="Top Risk Drivers" />

        <div style={{ display: 'grid', gap: 14 }}>
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Prediction Summary</h2>
            {[
              ['Predicted Class', casebook.model_output.predicted_label],
              ['Probability (Risiko Tinggi)', pct(casebook.model_output.probability)],
              ['Model Artifact', casebook.provenance.model_artifact],
              ['Model Type', 'XGBoost (Single Model)'],
              ['Explanation Method', 'SHAP contribution values'],
              ['Inference Mode', 'Offline (No Internet)'],
              ['Prediction ID', casebook.case_id],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: '1px solid var(--lp-line)' }}>
                <span style={{ color: 'var(--lp-muted)' }}>{label}</span>
                <strong style={{ textAlign: 'right', color: label.includes('Probability') ? 'var(--lp-cream)' : 'var(--lp-text)' }}>{value}</strong>
              </div>
            ))}
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Predicted Probability</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 18, alignItems: 'center' }}>
              <div style={{ width: 140, height: 140, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(#E05A4F 0 ${probability}%, #D8A42F ${probability}% ${Math.min(100, probability + Math.round(probabilities.medium * 100))}%, #4FA66A 0)` }}>
                <div style={{ width: 86, height: 86, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#11100F', textAlign: 'center', fontWeight: 950, color: 'var(--lp-cream)' }}>{probability}%<small style={{ display: 'block', color: 'var(--lp-muted)' }}>Risiko Tinggi</small></div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Risiko Tinggi</span><strong>{pct(probabilities.high)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Risiko Sedang</span><strong>{pct(probabilities.medium)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Risiko Rendah</span><strong>{pct(probabilities.low)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--lp-line)', paddingTop: 10 }}><span>Total</span><strong>100%</strong></div>
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Narasi Penjelasan</h2>
            <div style={{ padding: 14, borderRadius: 18, border: '1px solid rgba(215,209,176,.24)', background: 'rgba(215,209,176,.08)', marginBottom: 14 }}>
              Model mengklasifikasikan paket ini sebagai <strong>{casebook.model_output.predicted_label}</strong> karena beberapa faktor meningkatkan prioritas review.
            </div>
            <p style={{ color: 'var(--lp-text-soft)', lineHeight: 1.7 }}>{topPositive ? `Faktor terbesar adalah ${topPositive.feature_label} (${topPositive.shap_value.toFixed(3)}) yang menaikkan kontribusi risiko relatif terhadap baseline model.` : 'Tidak ada faktor peningkat risiko dalam payload casebook.'}</p>
            <p style={{ color: 'var(--lp-muted)', lineHeight: 1.7 }}>Faktor yang menurunkan risiko: {lowering.length ? lowering.map((factor) => `${factor.feature_label} (${factor.shap_value.toFixed(3)})`).join(', ') : 'tidak tersedia pada payload ini'}.</p>
            <strong className="safe-copy">Kesimpulan: probabilitas {probability}% digunakan untuk triase risiko dan prioritas review, bukan tuduhan pelanggaran.</strong>
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Dapat Dipahami oleh Manusia</h2>
            {[
              'Fitur diturunkan dari data pengadaan lokal yang tersedia.',
              'Setiap prediksi dapat dijelaskan melalui kontribusi fitur SHAP.',
              'Auditor dapat memverifikasi nilai fitur dan alasan prediksi secara independen.',
            ].map((item) => <p key={item} style={{ borderTop: '1px solid var(--lp-line)', paddingTop: 12, color: 'var(--lp-text-soft)' }}>✓ {item}</p>)}
          </section>
        </div>
      </div>

      <section className="card" style={{ marginTop: 18, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Trust & Guardrails</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {['Heuristic Risk Labels', 'Bukan tuduhan pelanggaran', 'Human Reviewer is Final Decision Maker', 'Offline Inference'].map((item, index) => (
            <div key={item} style={{ padding: 16, borderRadius: 18, border: '1px solid var(--lp-line)', background: 'rgba(255,255,255,.035)' }}><span className="badge">{index + 1}</span><h3>{item}</h3><p style={{ color: 'var(--lp-muted)', marginBottom: 0 }}>Prinsip transparansi dan akuntabilitas model untuk prioritas review.</p></div>
          ))}
        </div>
      </section>
    </main>
  );
}
