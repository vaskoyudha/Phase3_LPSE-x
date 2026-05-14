import { Scale } from 'lucide-react';

export function GuardrailBanner({ guardrail }: { guardrail: string }) {
  return (
    <aside className="card" style={{ padding: 14, borderColor: 'rgba(215,209,176,.24)', background: 'rgba(215,209,176,.08)' }}>
      <strong className="safe-copy" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Scale size={16} /> Human review guardrail: triase risiko · prioritas review · bukan tuduhan pelanggaran</strong>
      <p style={{ margin: '6px 0 0', color: 'var(--lp-text-soft)', fontSize: 12, lineHeight: 1.3 }}>{guardrail}</p>
    </aside>
  );
}
