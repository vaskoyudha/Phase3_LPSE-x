import { Eye, EyeOff } from 'lucide-react';
import { glassCreamSurface, glassSubtleSurface } from './glassStyles';

export function SafePresenterOverlay({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <section className="card" style={{ padding: 12, borderColor: visible ? 'rgba(215,209,176,.42)' : 'var(--lp-line)', background: 'var(--lp-panel)' }}>
      <button onClick={onToggle} style={{ width: '100%', borderRadius: 999, padding: '.62rem .8rem', color: 'var(--lp-bg-deep)', fontWeight: 820, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, lineHeight: 1, ...glassCreamSurface }}>
        <Icon size={16} />
        {visible ? 'Hide' : 'Show'} Safe Presenter Overlay
      </button>
      {visible && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 18, ...glassSubtleSurface }}>
          <h2 style={{ marginTop: 0 }}>LPSE-X adalah triase risiko</h2>
          <p>Gunakan output sebagai <strong>prioritas review</strong>, <strong>bukan tuduhan pelanggaran</strong>. Reviewer manusia wajib memeriksa bukti pendukung sebelum tindak lanjut.</p>
        </div>
      )}
    </section>
  );
}
