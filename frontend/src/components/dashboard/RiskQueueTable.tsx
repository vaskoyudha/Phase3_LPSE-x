import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle, ShieldCheck, WarningCircle, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { glassCreamSurface } from '../shared/glassStyles';
import type { QueueItem } from '../../types/api';

const PAGE_SIZE = 25;

const riskTone: Record<string, { color: string; background: string; Icon: PhosphorIcon }> = {
  'Risiko Tinggi': { color: '#E05A4F', background: 'rgba(224,90,79,.16)', Icon: WarningCircle },
  'Risiko Sedang': { color: '#D8A42F', background: 'rgba(216,164,47,.16)', Icon: ShieldCheck },
  'Risiko Rendah': { color: '#4FA66A', background: 'rgba(79,166,106,.15)', Icon: CheckCircle },
};

export function RiskQueueTable({ items, selectedId, onSelect }: { items: QueueItem[]; selectedId?: string; onSelect: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const firstIndex = safePage * PAGE_SIZE;
  const pageItems = useMemo(() => items.slice(firstIndex, firstIndex + PAGE_SIZE), [firstIndex, items]);

  useEffect(() => {
    setPage(0);
  }, [items]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <section className="risk-queue-table-surface" style={surface}>
      <div style={header}>
        <div>
          <h2 style={title}>Prioritas Review Paket Pengadaan</h2>
        </div>
        <div style={pager} aria-label="Queue pagination">
          <button type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} style={pageButton}>‹</button>
          <span style={pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} style={pageButton}>›</button>
        </div>
      </div>
      <div style={tableScroll}>
        <table style={table}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr style={{ color: 'var(--lp-muted)', textAlign: 'left', fontSize: 13 }}>
              <th style={th}>#</th><th style={th}>Package Title</th><th style={th}>Buyer</th><th style={th}>Supplier</th><th style={th}>Tender Value</th><th style={th}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const tone = riskTone[item.predicted_label] ?? riskTone['Risiko Sedang'];
              const selected = item.case_id === selectedId;
              const RiskIcon = tone.Icon;
              return (
                <tr key={item.case_id} onClick={() => onSelect(item.case_id)} aria-selected={selected} style={{ cursor: 'pointer', background: selected ? 'rgba(215,209,176,.14)' : item.predicted_label === 'Risiko Tinggi' ? 'rgba(224,90,79,.055)' : 'transparent', outline: selected ? '1px solid rgba(215,209,176,.42)' : 'none' }}>
                  <td style={td}>{item.risk_rank}</td>
                  <td style={{ ...td, fontWeight: 780, color: 'var(--lp-text)' }}><span style={oneLine}>{item.package_title}</span></td>
                  <td style={td}><span style={oneLine}>{item.buyer}</span></td>
                  <td style={td}><span style={oneLine}>{item.supplier}</span></td>
                  <td style={td}><span style={oneLine}>{item.tender_value_display}</span></td>
                  <td style={td}><span style={{ ...chip, color: tone.color, background: tone.background }}><RiskIcon size={11} weight="fill" />{item.predicted_label.replace('Risiko ', '')}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={footer}>
        Menampilkan {items.length === 0 ? '0' : `${firstIndex + 1}–${firstIndex + pageItems.length}`} dari {items.length.toLocaleString('id-ID')} paket antrean lokal — fokus cockpit tetap 25 baris per halaman untuk prioritas review.
      </p>
    </section>
  );
}

const surface: CSSProperties = { padding: 0, overflow: 'hidden', background: 'rgba(18, 16, 12, 0.88)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(215, 209, 176, 0.18)', borderRadius: 'var(--lp-radius-md)', color: 'var(--lp-text-soft)' };
const header: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, padding: '18px 20px 12px', borderBottom: '1px solid rgba(215,209,176,.1)' };
const title: CSSProperties = { margin: 0, letterSpacing: '-.035em', lineHeight: 1.05 };
const pager: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.075)' };
const pageButton: CSSProperties = { width: 30, height: 30, borderRadius: 999, color: 'var(--lp-bg-deep)', fontWeight: 820, cursor: 'pointer', ...glassCreamSurface };
const pageLabel: CSSProperties = { minWidth: 48, textAlign: 'center', color: 'var(--lp-muted)', fontSize: 13, fontWeight: 760 };
const tableScroll: CSSProperties = { overflowX: 'auto' };
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 760, tableLayout: 'fixed', background: 'linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,0))' };
const th: CSSProperties = { padding: '10px 20px 9px', borderBottom: '1px solid rgba(215,209,176,.14)', whiteSpace: 'nowrap', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', letterSpacing: '.055em', fontWeight: 860 };
const td: CSSProperties = { padding: '8.5px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', color: 'var(--lp-text-soft)', verticalAlign: 'middle', fontSize: 12.5, lineHeight: 1.2 };
const oneLine: CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const chip: CSSProperties = { display: 'inline-flex', borderRadius: 999, padding: '.28rem .46rem', fontWeight: 760, minWidth: 68, justifyContent: 'center', alignItems: 'center', gap: 4, fontSize: 10.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' };
const footer: CSSProperties = { margin: 0, padding: '12px 20px 16px', color: 'var(--lp-muted)', fontSize: 12.5 };
