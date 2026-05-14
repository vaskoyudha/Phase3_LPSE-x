import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { CSSProperties } from 'react';
import type { QueueResponse } from '../../types/api';
import { useMeasuredWidth } from './useMeasuredWidth';

type ArchiveRiskCounts = {
  matched_count: number;
  risk_distribution: Record<string, number>;
};

type RiskSegment = {
  label: string;
  count: number;
  color: string;
};

const fallbackColors: Record<string, string> = {
  'Risiko Tinggi': '#E05A4F',
  'Risiko Sedang': '#D8A42F',
  'Risiko Rendah': '#4FA66A',
};

const riskDistributionKeys = {
  tinggi: ['Risiko_Tinggi', 'Risiko Tinggi', 'risiko_tinggi'],
  sedang: ['Risiko_Sedang', 'Risiko Sedang', 'risiko_sedang'],
  rendah: ['Risiko_Rendah', 'Risiko Rendah', 'risiko_rendah'],
} as const;

const DONUT_SIZE = 140;
const DONUT_INNER_RADIUS = 38;
const DONUT_OUTER_RADIUS = 62;
const LEGEND_CARD_MAX_WIDTH = 208;

export function RiskDistributionChart({ queue, archiveCounts }: { queue: QueueResponse; archiveCounts?: ArchiveRiskCounts | null }) {
  const distribution: RiskSegment[] = archiveCounts ? distributionFromArchive(archiveCounts.risk_distribution) : distributionFromQueue(queue.distribution);
  const total = archiveCounts?.matched_count || distribution.reduce((sum, entry) => sum + entry.count, 0) || 1;
  const highShare = distribution.find((entry) => entry.label === 'Risiko Tinggi')?.count ?? 0;
  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();

  return (
    <section className="card risk-distribution-card" aria-label="Distribusi Risiko" style={{ padding: 14, minHeight: 274, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, lineHeight: 1.05, letterSpacing: '-.025em' }}>Distribusi<br />Risiko</h3>
        {archiveCounts && <span style={sourceBadge}>database terfilter</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(128px, ${DONUT_SIZE}px) minmax(136px, ${LEGEND_CARD_MAX_WIDTH}px)`, justifyContent: 'space-between', gap: 8, alignItems: 'center', minWidth: 0 }}>
        <div ref={chartRef} style={{ height: DONUT_SIZE, position: 'relative', minWidth: 0 }}>
          {chartWidth > 0 && (
            <PieChart width={chartWidth} height={DONUT_SIZE}>
              <Pie data={distribution} dataKey="count" nameKey="label" innerRadius={DONUT_INNER_RADIUS} outerRadius={DONUT_OUTER_RADIUS} paddingAngle={2} stroke="#201F1E" strokeWidth={2}>
                {distribution.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#201F1E', border: '1px solid rgba(215,209,176,.22)', borderRadius: 18, color: '#FFFFFF' }} />
            </PieChart>
          )}
          <div style={centerMetric} aria-hidden="true">
            <strong style={centerValue}>{((highShare / total) * 100).toFixed(0)}%</strong>
            <small style={centerCaption}>tinggi</small>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 7, width: '100%', maxWidth: LEGEND_CARD_MAX_WIDTH, justifySelf: 'end', fontSize: 12 }}>
          {distribution.map((entry) => {
            const color = entry.color;
            return <div key={entry.label} style={{ display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr) auto', gap: 7, alignItems: 'center', padding: '7px 8px', borderRadius: 14, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} /><span style={{ minWidth: 0 }}><strong>{entry.label}</strong><br /><small style={{ color: 'var(--lp-muted)', whiteSpace: 'nowrap' }}>{entry.count.toLocaleString('id-ID')} paket</small></span><strong style={{ color }}>{((entry.count / total) * 100).toFixed(0)}%</strong></div>;
          })}
        </div>
      </div>
    </section>
  );
}

function distributionFromQueue(distribution: QueueResponse['distribution']): RiskSegment[] {
  return distribution.map((entry) => ({
    label: entry.label,
    count: entry.count,
    color: fallbackColors[entry.label] ?? (entry as { color?: string }).color ?? '#D7D1B0',
  }));
}

function distributionFromArchive(riskDistribution: Record<string, number>): RiskSegment[] {
  return [
    { label: 'Risiko Tinggi', count: distributionCount(riskDistribution, riskDistributionKeys.tinggi), color: fallbackColors['Risiko Tinggi'] },
    { label: 'Risiko Sedang', count: distributionCount(riskDistribution, riskDistributionKeys.sedang), color: fallbackColors['Risiko Sedang'] },
    { label: 'Risiko Rendah', count: distributionCount(riskDistribution, riskDistributionKeys.rendah), color: fallbackColors['Risiko Rendah'] },
  ];
}

function distributionCount(distribution: Record<string, number>, keys: readonly string[]) {
  return keys.reduce((matched, key) => matched ?? distribution[key], undefined as number | undefined) ?? 0;
}

const centerMetric: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: 62,
  height: 62,
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  borderRadius: '50%',
  background: '#11100F',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)',
  pointerEvents: 'none',
  textAlign: 'center' as const,
  color: '#FFFFFF',
};

const centerValue: CSSProperties = {
  display: 'block',
  fontSize: 18,
  lineHeight: 1,
  letterSpacing: '-.03em',
  textShadow: 'none',
};

const centerCaption: CSSProperties = {
  display: 'block',
  color: 'var(--lp-muted)',
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '.02em',
  textTransform: 'uppercase',
};

const sourceBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '.28rem .55rem',
  color: 'var(--lp-bg-deep)',
  background: 'var(--lp-cream)',
  fontSize: 10.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  textTransform: 'lowercase',
  whiteSpace: 'nowrap',
};
