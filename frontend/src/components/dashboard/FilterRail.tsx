import type { CSSProperties } from 'react';
import { ArrowCounterClockwise, Buildings, Funnel, MagnifyingGlass, Question, Shield, ShieldCheck, ShieldWarning, Users } from '@phosphor-icons/react';
import { glassCreamSurface, glassSubtleSurface } from '../shared/glassStyles';

export type Filters = { search: string; risk: string; topN: string; buyer: string; supplier: string };

type FilterRailProps = {
  id?: string;
  className?: string;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  reset: () => void;
  buyers?: string[];
  suppliers?: string[];
  resultCount?: number;
  datasetMatchedCount?: number;
};

const inputStyle: CSSProperties = {
  width: '100%',
  marginTop: 5,
  borderRadius: 14,
  color: 'var(--lp-text)',
  padding: '.58rem .72rem',
  minHeight: 38,
  fontSize: 12,
  ...glassSubtleSurface,
};

const labelStyle: CSSProperties = { display: 'grid', gap: 2, color: 'var(--lp-muted)', fontSize: 11.5 };
const iconLabel: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5 };

const riskOptions = [
  { value: 'all', label: 'All', color: 'var(--lp-cream)', Icon: Question },
  { value: 'Risiko Tinggi', label: 'High', color: 'var(--lp-red)', Icon: ShieldWarning },
  { value: 'Risiko Sedang', label: 'Medium', color: 'var(--lp-amber)', Icon: Shield },
  { value: 'Risiko Rendah', label: 'Low', color: 'var(--lp-emerald)', Icon: ShieldCheck },
] as const;

export function FilterRail({ id, className, filters, setFilters, reset, buyers = [], suppliers = [], resultCount, datasetMatchedCount }: FilterRailProps) {
  const update = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  const matchedLabel = datasetMatchedCount ?? resultCount;

  return (
    <aside id={id} className={`card${className ? ` ${className}` : ''}`} style={{ padding: 14, display: 'grid', gap: 12, alignContent: 'start', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ ...iconLabel, margin: 0, color: 'var(--lp-cream)', letterSpacing: '.01em', fontSize: 11, fontWeight: 760 }}><Funnel size={12} weight="fill" /> Filters</p>
          {typeof matchedLabel === 'number' && <small style={{ display: 'block', marginTop: 4, color: 'var(--lp-muted)' }}>{matchedLabel.toLocaleString('id-ID')} matched</small>}
        </div>
        <button type="button" onClick={reset} style={resetButtonStyle}><ArrowCounterClockwise size={12} weight="bold" /> Reset</button>
      </div>

      <label style={labelStyle}>Search
        <span style={fieldShell}>
          <MagnifyingGlass size={13} weight="bold" style={{ color: 'var(--lp-muted)', flex: '0 0 auto' }} />
          <input style={bareInput} value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Package, ID, buyer..." />
        </span>
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        <legend style={{ color: 'var(--lp-muted)', fontSize: 11.5, marginBottom: 4 }}>Risk level</legend>
        <div style={riskGrid}>
          {riskOptions.map(({ value, label, color, Icon }) => {
            const active = filters.risk === value;
            return (
              <label key={value} style={{ ...riskOption, ...(active ? activeRiskOption : inactiveRiskOption), color: active ? 'var(--lp-bg-deep)' : 'var(--lp-text-soft)' }}>
                <input type="radio" name="risk" aria-label={value === 'all' ? 'Semua level' : value} checked={active} onChange={() => update('risk', value)} style={{ accentColor: color, margin: 0, width: 11, height: 11 }} />
                <span style={{ ...riskIcon, color }}><Icon size={12} weight="fill" /></span>
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label style={labelStyle}><span style={iconLabel}><Buildings size={11} weight="fill" /> Buyer</span>
        <select style={inputStyle} value={filters.buyer} onChange={(event) => update('buyer', event.target.value)}>
          <option value="">All buyers</option>
          {buyers.map((buyer) => <option key={buyer} value={buyer}>{buyer}</option>)}
        </select>
      </label>

      <label style={labelStyle}><span style={iconLabel}><Users size={11} weight="fill" /> Supplier</span>
        <select style={inputStyle} value={filters.supplier} onChange={(event) => update('supplier', event.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </label>

      <label style={labelStyle}>Overview limit
        <select style={inputStyle} value={filters.topN} onChange={(event) => update('topN', event.target.value)}>
          <option value="10">Top 10</option>
          <option value="25">Top 25</option>
          <option value="50">Top 50</option>
          <option value="100">Top 100</option>
        </select>
      </label>
    </aside>
  );
}

const fieldShell: CSSProperties = {
  ...inputStyle,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const bareInput: CSSProperties = {
  width: '100%',
  border: 0,
  color: 'var(--lp-text)',
  background: 'transparent',
};

const riskGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 6,
};

const riskOption: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '11px 20px 1fr',
  alignItems: 'center',
  gap: 6,
  border: '1px solid rgba(255,255,255,.075)',
  borderRadius: 14,
  padding: '7px 8px',
  color: 'var(--lp-text-soft)',
  minHeight: 38,
  fontSize: 11.5,
  fontWeight: 720,
  cursor: 'pointer',
};

const inactiveRiskOption: CSSProperties = {
  ...glassSubtleSurface,
  boxShadow: 'var(--lp-glass-shadow-soft)',
};

const activeRiskOption: CSSProperties = {
  ...glassCreamSurface,
};

const riskIcon: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  ...glassSubtleSurface,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)',
};

const resetButtonStyle: CSSProperties = {
  borderRadius: 999,
  padding: '.48rem .68rem',
  minHeight: 32,
  color: 'var(--lp-bg-deep)',
  fontWeight: 780,
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 5,
  fontSize: 11.5,
  whiteSpace: 'nowrap',
  ...glassCreamSurface,
};
