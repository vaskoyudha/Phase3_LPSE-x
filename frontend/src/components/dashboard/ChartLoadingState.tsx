import type { CSSProperties } from 'react';
import { Activity, BarChart3 } from 'lucide-react';

type ChartLoadingVariant = 'matrix' | 'bars' | 'donut' | 'list';

type ChartLoadingStateProps = {
  label?: string;
  detail?: string;
  variant?: ChartLoadingVariant;
  height?: number;
  compact?: boolean;
};

const matrixPoints = [
  ['13%', '70%', 'high'],
  ['20%', '48%', 'low'],
  ['31%', '58%', 'medium'],
  ['42%', '36%', 'high'],
  ['55%', '66%', 'medium'],
  ['66%', '42%', 'low'],
  ['76%', '55%', 'high'],
  ['86%', '32%', 'medium'],
] as const;

const barHeights = [34, 62, 48, 78, 56, 88, 42, 70] as const;
const donutSlices = ['high', 'medium', 'low'] as const;
const listRows = [92, 74, 81, 63, 88] as const;

export function ChartLoadingState({
  label = 'Loading chart data',
  detail = 'Preparing local inference summary',
  variant = 'bars',
  height = 150,
  compact = false,
}: ChartLoadingStateProps) {
  return (
    <div className={`chart-loader chart-loader--${variant}${compact ? ' chart-loader--compact' : ''}`} style={{ minHeight: height } as CSSProperties} role="status" aria-live="polite" aria-label={label}>
      <span className="chart-loader__scan" aria-hidden="true" />
      <div className="chart-loader__header">
        <span className="chart-loader__icon"><Activity size={14} className="spin-icon" /></span>
        <span><strong>{label}</strong><small>{detail}</small></span>
      </div>
      <div className="chart-loader__stage" aria-hidden="true">
        {variant === 'matrix' && <MatrixSkeleton />}
        {variant === 'bars' && <BarSkeleton />}
        {variant === 'donut' && <DonutSkeleton />}
        {variant === 'list' && <ListSkeleton />}
      </div>
    </div>
  );
}

export function ChartLoadingBadge({ label = 'Updating' }: { label?: string }) {
  return (
    <span className="chart-loading-badge" role="status" aria-live="polite">
      <BarChart3 size={12} /> {label}
    </span>
  );
}

function MatrixSkeleton() {
  return (
    <div className="chart-loader__matrix">
      {matrixPoints.map(([left, top, tone], index) => (
        <span key={`${left}-${top}`} className={`chart-loader__point chart-loader__point--${tone}`} style={{ left, top, animationDelay: `${index * 110}ms` }} />
      ))}
    </div>
  );
}

function BarSkeleton() {
  return (
    <div className="chart-loader__bars">
      {barHeights.map((height, index) => (
        <span key={height + index} className="chart-loader__bar" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className="chart-loader__donut">
      {donutSlices.map((tone, index) => <span key={tone} className={`chart-loader__donut-dot chart-loader__donut-dot--${tone}`} style={{ animationDelay: `${index * 140}ms` }} />)}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="chart-loader__list">
      {listRows.map((width, index) => (
        <span key={width} className="chart-loader__row"><i style={{ width: `${width}%`, animationDelay: `${index * 80}ms` }} /></span>
      ))}
    </div>
  );
}
