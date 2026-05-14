import { CheckCircle, Package, ShieldCheck, WarningCircle, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { glassControlSurface, glassCreamIcon } from '../shared/glassStyles';
import type { QueueResponse } from '../../types/api';

type KpiArchiveCounts = {
  matched_count: number;
  risk_distribution: Record<string, number>;
};

const cards = [
  { key: 'total', label: 'Total Packages', tone: 'var(--lp-cream)', Icon: Package },
  { key: 'risiko_tinggi', label: 'Risiko Tinggi', tone: 'var(--lp-red)', Icon: WarningCircle },
  { key: 'risiko_sedang', label: 'Risiko Sedang', tone: 'var(--lp-amber)', Icon: ShieldCheck },
  { key: 'risiko_rendah', label: 'Risiko Rendah', tone: 'var(--lp-emerald)', Icon: CheckCircle },
] as const;

const riskDistributionKeys = {
  risiko_tinggi: ['Risiko_Tinggi', 'Risiko Tinggi', 'risiko_tinggi'],
  risiko_sedang: ['Risiko_Sedang', 'Risiko Sedang', 'risiko_sedang'],
  risiko_rendah: ['Risiko_Rendah', 'Risiko Rendah', 'risiko_rendah'],
} as const;

type KpiCardsVariant = 'wide' | 'rail';

export function KpiCards({ queue, archiveCounts, variant = 'wide' }: { queue: QueueResponse; archiveCounts?: KpiArchiveCounts | null; variant?: KpiCardsVariant }) {
  const summary = archiveCounts ? archiveSummary(archiveCounts) : queue.summary;
  const isRail = variant === 'rail';

  return (
    <div className={`kpi-grid kpi-grid--${variant}`} style={{ display: 'grid', gap: isRail ? 8 : 12 }}>
      {cards.map((card) => {
        const value = summary[card.key] ?? 0;
        const Icon = card.Icon as PhosphorIcon;
        return (
          <section
            key={card.key}
            className={`card kpi-card kpi-card--${variant}`}
            aria-label={`${card.label} KPI`}
            style={{
              padding: isRail ? 11 : 16,
              display: 'grid',
              gridTemplateColumns: `${isRail ? 38 : 48}px minmax(0, 1fr)`,
              gap: isRail ? 9 : 12,
              alignItems: 'center',
              background: 'var(--lp-panel)',
              position: 'relative',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <span aria-hidden="true" style={{ position: 'absolute', inset: isRail ? '10px 12px auto auto' : '12px 16px auto auto', width: isRail ? 7 : 9, height: isRail ? 7 : 9, borderRadius: '50%', background: card.tone, opacity: .9 }} />
            <span aria-hidden="true" style={{ width: isRail ? 38 : 48, height: isRail ? 38 : 48, borderRadius: isRail ? 15 : 18, display: 'grid', placeItems: 'center', ...(card.key === 'total' ? glassCreamIcon : glassControlSurface), color: card.key === 'total' ? 'var(--lp-bg-deep)' : card.tone }}>
              <Icon size={isRail ? 20 : 25} weight="fill" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: 'var(--lp-text-soft)', fontSize: isRail ? 11.5 : 13, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{card.label}</span>
              <strong style={{ display: 'block', fontSize: isRail ? 'clamp(18px, 1.35vw, 23px)' : 'clamp(24px, 1.9vw, 30px)', lineHeight: .98, letterSpacing: '-.045em' }}>{value.toLocaleString('id-ID')}</strong>
            </span>
          </section>
        );
      })}
    </div>
  );
}

function archiveSummary(archiveCounts: KpiArchiveCounts): Record<string, number> {
  return {
    total: archiveCounts.matched_count,
    risiko_tinggi: distributionCount(archiveCounts.risk_distribution, riskDistributionKeys.risiko_tinggi),
    risiko_sedang: distributionCount(archiveCounts.risk_distribution, riskDistributionKeys.risiko_sedang),
    risiko_rendah: distributionCount(archiveCounts.risk_distribution, riskDistributionKeys.risiko_rendah),
  };
}

function distributionCount(distribution: Record<string, number>, keys: readonly string[]) {
  return keys.reduce((matched, key) => matched ?? distribution[key], undefined as number | undefined) ?? 0;
}
