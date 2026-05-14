import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../../api/client';
import type { ReviewRecord, ReviewStatus } from '../../types/api';
import { glassSubtleSurface } from '../shared/glassStyles';

const statuses: ReviewStatus[] = ['Perlu Review', 'Sedang Direview', 'Butuh Bukti Tambahan', 'Ditandai Risiko', 'Clear / Tidak Prioritas', 'Selesai'];

export function ReviewDrawer({ caseId, open = true }: { caseId: string; open?: boolean }) {
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [status, setStatus] = useState<ReviewStatus>('Perlu Review');
  const [reviewerName, setReviewerName] = useState('');
  const [notes, setNotes] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [signedOff, setSignedOff] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api.review(caseId)
      .then((payload) => {
        if (!alive) return;
        setReview(payload);
        setStatus(payload.status);
        setReviewerName(payload.reviewer_name ?? '');
        setNotes(payload.notes ?? '');
        setDecisionSummary(payload.decision_summary ?? '');
        setSignedOff(Boolean(payload.signed_off_at));
        setError('');
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Review API failed');
      });
    return () => { alive = false; };
  }, [caseId, open]);

  if (!open) return null;

  const checklist = review?.prefill.checklist ?? [];
  const rationale = review?.prefill.rationale || 'Model rationale is not available for this package yet.';

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await api.saveReview(caseId, {
        status,
        reviewer_name: reviewerName,
        notes,
        decision_summary: decisionSummary,
        signed_off: signedOff,
      });
      setReview(saved);
      setMessage(`Saved as ${saved.status}`);
      setSignedOff(Boolean(saved.signed_off_at));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save review failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" role="region" aria-label="Package review drawer" style={styles.drawer}>
      <div style={styles.header}>
        <p style={styles.eyebrow}>AI/model prefill</p>
        <h2 style={styles.title}>Human review sign-off</h2>
        <p style={styles.copy}>Saved locally to SQLite. This record documents reviewer judgement, not an accusation or final legal finding.</p>
      </div>

      {error && <p role="alert" style={styles.error}>Review error: {error}</p>}
      {message && <p role="status" style={styles.success}>{message}</p>}
      {!review && !error && <p style={styles.copy}>Loading review draft…</p>}

      {review && (
        <>
          <div style={styles.prefillBox}>
            <strong>Rationale</strong>
            <p style={styles.copy}>{rationale}</p>
            <strong>Checklist</strong>
            <ul style={styles.checklist}>
              {checklist.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
              {checklist.length === 0 && <li>Gunakan faktor Casebook untuk memverifikasi dokumen pendukung.</li>}
            </ul>
          </div>

          <label style={styles.label}>Reviewer name
            <input style={styles.input} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Nama reviewer" />
          </label>

          <label style={styles.label}>Review status
            <select style={styles.input} value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label style={styles.label}>Decision summary
            <input style={styles.input} value={decisionSummary} onChange={(event) => setDecisionSummary(event.target.value)} placeholder="Ringkasan keputusan reviewer" />
          </label>

          <label style={styles.label}>Reviewer notes
            <textarea style={{ ...styles.input, minHeight: 96, resize: 'vertical' }} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan bukti, konteks, atau tindak lanjut" />
          </label>

          <label style={styles.checkboxLabel}>
            <input type="checkbox" checked={signedOff} onChange={(event) => setSignedOff(event.target.checked)} />
            Sign off review after checking the package context
          </label>

          <button type="button" style={styles.saveButton} onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save review'}
          </button>
        </>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  drawer: { padding: 16, display: 'grid', gap: 12, border: '1px solid rgba(235,230,201,.18)', background: 'linear-gradient(180deg, rgba(235,230,201,.08), rgba(17,16,15,.58))' },
  header: { display: 'grid', gap: 4 },
  eyebrow: { margin: 0, color: 'var(--lp-cream)', fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.08em' },
  title: { margin: 0, fontSize: 22, letterSpacing: '-.035em' },
  copy: { margin: 0, color: 'var(--lp-muted)', lineHeight: 1.45, fontSize: 13 },
  prefillBox: { display: 'grid', gap: 8, padding: 12, borderRadius: 18, background: 'rgba(0,0,0,.16)', border: '1px solid rgba(255,255,255,.08)' },
  checklist: { margin: 0, paddingLeft: 18, color: 'var(--lp-text-soft)', fontSize: 13, lineHeight: 1.45 },
  label: { display: 'grid', gap: 6, fontSize: 12, fontWeight: 830, color: 'var(--lp-text-soft)' },
  input: { borderRadius: 13, color: 'var(--lp-text)', padding: '.72rem .82rem', font: 'inherit', ...glassSubtleSurface },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lp-text-soft)', fontSize: 13, fontWeight: 750 },
  saveButton: { border: 0, borderRadius: 999, background: 'var(--lp-cream)', color: 'var(--lp-bg-deep)', padding: '.85rem 1rem', fontWeight: 880 },
  error: { margin: 0, color: '#FECACA', fontWeight: 760 },
  success: { margin: 0, color: '#BBF7D0', fontWeight: 820 },
};
