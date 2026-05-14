import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CheckCircle, DownloadSimple, FileCsv, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { api } from '../../api/client';
import type { UploadedPackageItem, UploadedPackageScoreResponse } from '../../types/api';

type EntryMode = 'csv' | 'manual';

type ManualTenderForm = {
  tenderTitle: string;
  tenderDescription: string;
  buyerName: string;
  supplierName: string;
  tenderValueAmount: string;
  awardValueAmount: string;
  tenderDatePublished: string;
  tenderProcurementMethod: string;
  tenderMainProcurementCategory: string;
};

const manualTenderDefaults: ManualTenderForm = {
  tenderTitle: '',
  tenderDescription: '',
  buyerName: '',
  supplierName: '',
  tenderValueAmount: '',
  awardValueAmount: '',
  tenderDatePublished: '',
  tenderProcurementMethod: 'open',
  tenderMainProcurementCategory: 'works',
};

const manualTenderColumns = [
  'tender_title',
  'tender_description',
  'buyer_name',
  'supplier_name',
  'tender_value_amount',
  'award_value_amount',
  'tender_datePublished',
  'tender_procurementMethod',
  'tender_mainProcurementCategory',
];

export function UploadedTenderCsvPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<EntryMode>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [manualForm, setManualForm] = useState<ManualTenderForm>(manualTenderDefaults);
  const [result, setResult] = useState<UploadedPackageScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submitUpload() {
    if (!file) {
      setError('Pilih file CSV terlebih dahulu.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const payload = await api.uploadTenderPackages(file);
      setResult(payload);
    } catch (exc) {
      setResult(null);
      setError(exc instanceof Error ? exc.message : 'Upload CSV gagal.');
    } finally {
      setUploading(false);
    }
  }

  async function submitManualUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualFormIsReady(manualForm)) {
      setError('Lengkapi input manual terlebih dahulu.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const payload = await api.scoreTenderPackageCsv(manualTenderToCsv(manualForm));
      setResult(payload);
    } catch (exc) {
      setResult(null);
      setError(exc instanceof Error ? exc.message : 'Input manual gagal discore.');
    } finally {
      setUploading(false);
    }
  }

  function updateManualField(field: keyof ManualTenderForm, value: string) {
    setManualForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  const rows = result?.items ?? [];
  const manualReady = manualFormIsReady(manualForm);

  return (
    <section className="card" style={styles.card} aria-label="Upload CSV paket tender">
      <div style={styles.header}>
        <div style={styles.titleBlock}>
          <span style={styles.iconWrap}><FileCsv size={22} weight="duotone" /></span>
          <div>
            <h2 style={styles.title}>Upload CSV Paket Tender</h2>
            <p style={styles.subtitle}>Skor baris baru sebagai <strong>uploaded_csv</strong>; train/test archive tetap terpisah.</p>
          </div>
        </div>
        <a href={api.tenderPackageTemplateUrl()} download="lpse-x-tender-packages-template.csv" style={styles.templateLink}>
          <DownloadSimple size={16} />
          Template CSV
        </a>
      </div>

      <div role="tablist" aria-label="Mode input paket tender" style={styles.modeTabs}>
        <button type="button" role="tab" aria-selected={mode === 'csv'} onClick={() => setMode('csv')} style={{ ...styles.modeTab, ...(mode === 'csv' ? styles.modeTabActive : undefined) }}>CSV file</button>
        <button type="button" role="tab" aria-selected={mode === 'manual'} onClick={() => setMode('manual')} style={{ ...styles.modeTab, ...(mode === 'manual' ? styles.modeTabActive : undefined) }}>Input manual</button>
      </div>

      {mode === 'csv' && (
        <div style={styles.uploadRow}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="Pilih CSV paket tender"
            style={styles.hiddenInput}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} style={styles.fileButton}>
            <FileCsv size={18} />
            {file ? file.name : 'Pilih CSV'}
          </button>
          <button type="button" disabled={!file || uploading} onClick={submitUpload} style={{ ...styles.submitButton, ...((!file || uploading) ? styles.disabledButton : undefined) }}>
            <UploadSimple size={18} />
            {uploading ? 'Menilai...' : 'Upload & Skor'}
          </button>
          <span style={styles.limitText}>maks. 1.000 baris</span>
        </div>
      )}

      {mode === 'manual' && (
        <form onSubmit={submitManualUpload} style={styles.manualForm}>
          <label style={{ ...styles.field, ...styles.fieldWide }}>
            <span style={styles.labelText}>Judul tender</span>
            <input aria-label="Judul tender manual" value={manualForm.tenderTitle} onChange={(event) => updateManualField('tenderTitle', event.target.value)} style={styles.input} />
          </label>
          <label style={{ ...styles.field, ...styles.fieldWide }}>
            <span style={styles.labelText}>Deskripsi</span>
            <textarea aria-label="Deskripsi tender manual" value={manualForm.tenderDescription} onChange={(event) => updateManualField('tenderDescription', event.target.value)} rows={2} style={{ ...styles.input, ...styles.textarea }} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Buyer</span>
            <input aria-label="Nama buyer manual" value={manualForm.buyerName} onChange={(event) => updateManualField('buyerName', event.target.value)} style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Supplier</span>
            <input aria-label="Nama supplier manual" value={manualForm.supplierName} onChange={(event) => updateManualField('supplierName', event.target.value)} style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Nilai tender</span>
            <input aria-label="Nilai tender manual" inputMode="numeric" value={manualForm.tenderValueAmount} onChange={(event) => updateManualField('tenderValueAmount', event.target.value)} style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Nilai award</span>
            <input aria-label="Nilai award manual" inputMode="numeric" value={manualForm.awardValueAmount} onChange={(event) => updateManualField('awardValueAmount', event.target.value)} style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Tanggal publikasi</span>
            <input aria-label="Tanggal publikasi manual" type="date" value={manualForm.tenderDatePublished} onChange={(event) => updateManualField('tenderDatePublished', event.target.value)} style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Metode</span>
            <select aria-label="Metode pengadaan manual" value={manualForm.tenderProcurementMethod} onChange={(event) => updateManualField('tenderProcurementMethod', event.target.value)} style={styles.input}>
              <option value="open">open</option>
              <option value="selective">selective</option>
              <option value="limited">limited</option>
              <option value="direct">direct</option>
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.labelText}>Kategori</span>
            <select aria-label="Kategori pengadaan manual" value={manualForm.tenderMainProcurementCategory} onChange={(event) => updateManualField('tenderMainProcurementCategory', event.target.value)} style={styles.input}>
              <option value="works">works</option>
              <option value="goods">goods</option>
              <option value="services">services</option>
            </select>
          </label>
          <div style={styles.manualActions}>
            <button type="submit" disabled={!manualReady || uploading} style={{ ...styles.submitButton, ...((!manualReady || uploading) ? styles.disabledButton : undefined) }}>
              <UploadSimple size={18} />
              {uploading ? 'Menilai...' : 'Skor Manual'}
            </button>
            <button type="button" onClick={() => { setManualForm(manualTenderDefaults); setError(null); }} style={styles.secondaryButton}>Reset</button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" style={styles.error}>
          <WarningCircle size={16} />
          {error}
        </p>
      )}

      {result && (
        <div style={styles.resultShell}>
          <div style={styles.resultHeader}>
            <span style={styles.successPill}><CheckCircle size={16} /> {result.rows_scored.toLocaleString('id-ID')} baris discore</span>
            <span style={styles.metaPill}>{result.model_artifact}</span>
            <span style={styles.metaPill}>{result.eval_claim_scope}</span>
          </div>
          <div style={styles.resultTableFrame}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Risk</th>
                  <th style={styles.th}>Paket</th>
                  <th style={styles.th}>Buyer</th>
                  <th style={styles.th}>Supplier</th>
                  <th style={styles.th}>Nilai</th>
                  <th style={styles.th}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <UploadedRow key={row.case_id} row={row} />)}
              </tbody>
            </table>
          </div>
          <p style={styles.guardrail}>{result.guardrail}</p>
        </div>
      )}
    </section>
  );
}

function UploadedRow({ row }: { row: UploadedPackageItem }) {
  return (
    <tr style={styles.tr}>
      <td style={styles.td}><span style={{ ...styles.riskPill, ...riskTone(row.predicted_label) }}>{row.predicted_label}</span></td>
      <td style={styles.td}>
        <strong style={styles.oneLine}>{row.package_title}</strong>
        <small style={styles.subLine}>#{row.upload_rank} · {row.ocid ?? row.tender_id ?? row.case_id}</small>
      </td>
      <td style={styles.td}><span style={styles.oneLine}>{row.buyer}</span></td>
      <td style={styles.td}><span style={styles.oneLine}>{row.supplier}</span></td>
      <td style={styles.td}><span style={styles.oneLine}>{row.tender_value_display}</span></td>
      <td style={styles.td}><span style={styles.scopePill}>{row.source_split}</span></td>
    </tr>
  );
}

function manualFormIsReady(form: ManualTenderForm) {
  return [
    form.tenderTitle,
    form.tenderDescription,
    form.buyerName,
    form.supplierName,
    form.tenderValueAmount,
    form.awardValueAmount,
    form.tenderDatePublished,
    form.tenderProcurementMethod,
    form.tenderMainProcurementCategory,
  ].every((value) => value.trim().length > 0);
}

function manualTenderToCsv(form: ManualTenderForm) {
  const values = [
    form.tenderTitle,
    form.tenderDescription,
    form.buyerName,
    form.supplierName,
    form.tenderValueAmount,
    form.awardValueAmount,
    form.tenderDatePublished,
    form.tenderProcurementMethod,
    form.tenderMainProcurementCategory,
  ];
  return `${manualTenderColumns.join(',')}\n${values.map(toCsvCell).join(',')}\n`;
}

function toCsvCell(value: string) {
  const normalized = value.trim().replace(/\r?\n/g, ' ');
  if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

function riskTone(label: string): CSSProperties {
  if (label.includes('Tinggi')) return { color: '#E05A4F', background: 'rgba(224,90,79,.16)', borderColor: 'rgba(224,90,79,.34)' };
  if (label.includes('Rendah')) return { color: '#4FA66A', background: 'rgba(79,166,106,.15)', borderColor: 'rgba(79,166,106,.32)' };
  return { color: '#D8A42F', background: 'rgba(216,164,47,.16)', borderColor: 'rgba(216,164,47,.32)' };
}

const styles: Record<string, CSSProperties> = {
  card: { display: 'grid', gap: 14, padding: 18, overflow: 'hidden', background: 'var(--lp-panel)', borderColor: 'rgba(215,209,176,.16)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  titleBlock: { display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 },
  iconWrap: { width: 42, height: 42, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--lp-bg-deep)', background: 'var(--lp-cream)' },
  title: { margin: 0, color: 'var(--lp-text)', fontSize: 22, lineHeight: 1.1, letterSpacing: 0 },
  subtitle: { margin: '5px 0 0', color: 'var(--lp-muted)', fontSize: 13, lineHeight: 1.5 },
  templateLink: { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 13px', borderRadius: 8, border: '1px solid rgba(215,209,176,.22)', background: 'rgba(215,209,176,.08)', color: 'var(--lp-cream)', textDecoration: 'none', fontWeight: 800, fontSize: 13 },
  modeTabs: { display: 'inline-flex', width: 'fit-content', maxWidth: '100%', padding: 4, gap: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.04)' },
  modeTab: { minHeight: 34, padding: '0 12px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--lp-muted)', fontWeight: 820, cursor: 'pointer' },
  modeTabActive: { color: 'var(--lp-bg-deep)', background: 'var(--lp-cream)', borderColor: 'rgba(215,209,176,.42)' },
  uploadRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  hiddenInput: { position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 },
  fileButton: { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 42, maxWidth: 'min(100%, 360px)', padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.055)', color: 'var(--lp-text)', fontWeight: 760, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  submitButton: { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 15px', borderRadius: 8, border: '1px solid rgba(79,166,106,.38)', background: 'rgba(79,166,106,.18)', color: '#BCE8C9', fontWeight: 820, cursor: 'pointer' },
  secondaryButton: { display: 'inline-flex', alignItems: 'center', minHeight: 42, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.045)', color: 'var(--lp-text-soft)', fontWeight: 780, cursor: 'pointer' },
  disabledButton: { opacity: .52, cursor: 'not-allowed' },
  limitText: { color: 'var(--lp-muted)', fontSize: 12, fontWeight: 700 },
  manualForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.025)' },
  field: { display: 'grid', gap: 6, minWidth: 0 },
  fieldWide: { gridColumn: '1 / -1' },
  labelText: { color: 'var(--lp-muted)', fontSize: 11, fontWeight: 820, textTransform: 'uppercase', letterSpacing: 0 },
  input: { width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(17,16,15,.66)', color: 'var(--lp-text)', padding: '0 11px', fontSize: 13, fontWeight: 700, outline: 0 },
  textarea: { minHeight: 64, resize: 'vertical', paddingTop: 10, lineHeight: 1.4 },
  manualActions: { display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  error: { display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: '#F5B5AD', background: 'rgba(224,90,79,.12)', border: '1px solid rgba(224,90,79,.28)', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 740 },
  resultShell: { display: 'grid', gap: 12, minWidth: 0 },
  resultHeader: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  successPill: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, color: '#BCE8C9', background: 'rgba(79,166,106,.15)', border: '1px solid rgba(79,166,106,.32)', fontSize: 12, fontWeight: 840 },
  metaPill: { display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: 999, color: 'var(--lp-text-soft)', background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.085)', fontSize: 12, fontWeight: 760 },
  resultTableFrame: { overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { padding: '10px 12px', textAlign: 'left', color: 'var(--lp-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0, background: 'rgba(255,255,255,.035)', borderBottom: '1px solid rgba(255,255,255,.08)' },
  tr: { borderBottom: '1px solid rgba(255,255,255,.06)' },
  td: { padding: '12px', color: 'var(--lp-text-soft)', fontSize: 13, fontWeight: 650, verticalAlign: 'top' },
  oneLine: { display: 'block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  subLine: { display: 'block', marginTop: 4, color: 'var(--lp-muted)', fontSize: 11.5, fontWeight: 650, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  riskPill: { display: 'inline-flex', alignItems: 'center', padding: '5px 8px', borderRadius: 999, border: '1px solid', fontWeight: 820, fontSize: 12, whiteSpace: 'nowrap' },
  scopePill: { display: 'inline-flex', padding: '5px 8px', borderRadius: 999, border: '1px solid rgba(215,209,176,.2)', background: 'rgba(215,209,176,.08)', color: 'var(--lp-cream)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' },
  guardrail: { margin: 0, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.5 },
};
