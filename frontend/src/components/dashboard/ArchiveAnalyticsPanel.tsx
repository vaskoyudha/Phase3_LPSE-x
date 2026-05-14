import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Database, Info, MapPinned, MousePointerClick, PieChart, ShieldCheck, Target, UsersRound } from 'lucide-react';
import type { ArchiveAnalyticsResponse, ArchiveConcentrationItem, ArchiveDonutSegment, ArchiveMonthlyRiskTrend, ArchivePriorityPoint } from '../../types/api';
import { useMeasuredWidth } from './useMeasuredWidth';
import { ChartLoadingBadge, ChartLoadingState } from './ChartLoadingState';
import { glassCreamIcon, glassCreamSurface, glassSubtleSurface } from '../shared/glassStyles';
import { RiskTrendChart } from './RiskTrendChart';

type Props = {
  analytics: ArchiveAnalyticsResponse | null;
  loading?: boolean;
  error?: string | null;
  activeRisk: string;
  onRiskFilter: (risk: string) => void;
  onSelectPoint: (point: ArchivePriorityPoint) => void;
  monthlyTrends?: ArchiveMonthlyRiskTrend[];
  dateRange?: { start_month: string | null; end_month: string | null };
};

type VisualPriorityPoint = ArchivePriorityPoint & {
  riskTierPosition: number;
  riskTierLabel: string;
  valueScale: number;
  visualPriority: number;
};

type TopPatterns = {
  matchedRows: number;
  highRiskCount: number;
  highRiskShare: number;
  topRegion: string | null;
  topBuyer: string | null;
  priorityReturned: number;
  priorityLimit: number;
};

const RISK_TIERS = [
  { label: 'Risiko Rendah', short: 'Rendah', position: 1, color: '#4FA66A', glow: 'rgba(79,166,106,.16)' },
  { label: 'Risiko Sedang', short: 'Sedang', position: 2, color: '#D8A42F', glow: 'rgba(216,164,47,.16)' },
  { label: 'Risiko Tinggi', short: 'Tinggi', position: 3, color: '#E05A4F', glow: 'rgba(224,90,79,.16)' },
] as const;

const UNCLASSIFIED_REGION_LABELS = ['tidak tersedia', 'unknown buyer region', 'unknown', 'n/a', '-', ''];

export function ArchiveAnalyticsPanel({ analytics, loading = false, error = null, activeRisk, onRiskFilter, onSelectPoint, monthlyTrends = [], dateRange }: Props) {
  const [scatterRef, scatterWidth] = useMeasuredWidth<HTMLDivElement>();
  const [selectedPoint, setSelectedPoint] = useState<ArchivePriorityPoint | null>(null);
  const points = analytics?.priority_map ?? [];
  const visualPoints = points.map(toVisualPriorityPoint);
  const maxValueScale = Math.max(1, ...visualPoints.map((point) => point.valueScale));
  const topPoints = points.slice(0, 5);
  const initialLoading = loading && !analytics;
  const topPatterns = analytics ? buildTopPatterns(analytics) : null;

  useEffect(() => {
    if (!selectedPoint) return;
    if (!points.some((point) => point.archive_id === selectedPoint.archive_id)) {
      setSelectedPoint(null);
    }
  }, [points, selectedPoint]);

  function handleSelectPoint(point: ArchivePriorityPoint) {
    setSelectedPoint(point);
    onSelectPoint(point);
  }

  return (
    <section className="archive-analytics-panel" style={styles.shell} aria-label="Archive analytics charts">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Full Archive Risk Analytics</h2>
          <p style={styles.muted}>Bounded charts summarize the filtered local tender archive for triase risiko and prioritas review, bukan tuduhan pelanggaran.</p>
        </div>
      </div>

      {error && <p role="alert" style={styles.error}>Archive analytics API gagal: {error}</p>}
      {loading && analytics && <p style={styles.muted}><ChartLoadingBadge label="Refreshing analytics" /></p>}

      <section data-testid="analytics-zone-state" data-zone="state" style={styles.zoneState}>
        <h3 style={styles.zoneHeading}>State of the archive</h3>
        {initialLoading ? (
          <ZoneSkeleton height={200} label="Loading state overview" />
        ) : (
          <>
            <div style={styles.kpiRow}>
              <Metric icon={<Database size={15} />} label="Matched archive" value={formatNumber(analytics?.counts.matched_count)} />
              <Metric icon={<Target size={15} />} label="Priority points" value={`${formatNumber(analytics?.priority_map_meta.points_returned)} dari ${formatNumber(analytics?.priority_map_meta.point_limit ?? 500)}`} />
              <Metric icon={<ShieldCheck size={15} />} label="Held-out filtered" value={formatNumber(analytics?.coverage_proof.filtered_heldout_rows)} />
            </div>
            <div style={styles.zoneStateGrid}>
              <div className="card" style={styles.stateRiskCard}>
                <div style={styles.panelHeader}>
                  <h3 style={styles.panelTitle}><PieChart size={17} color="#D7D1B0" /> Komposisi Risiko</h3>
                  <span style={styles.note}>filter-safe buttons</span>
                </div>
                <RiskDonut segments={analytics?.donut ?? []} activeRisk={activeRisk} onRiskFilter={onRiskFilter} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <RiskTrendChart trend={monthlyTrends} dateRange={dateRange} loading={loading} />
              </div>
            </div>
          </>
        )}
      </section>

      <section data-testid="analytics-zone-focus" data-zone="focus">
        <h3 style={styles.zoneHeading}>Where to focus</h3>
        {initialLoading ? <ZoneSkeleton height={320} label="Loading focus zone" /> : (
          <div style={styles.zoneFocusGrid}>
            <article className="card" style={{ ...styles.panel, minWidth: 0 }}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}><Target size={17} color="#c9c1b4" /> Risk Tier × Contract Value Matrix</h3>
                <span style={styles.caveatChip}>{loading ? <ChartLoadingBadge label="Loading matrix" /> : analytics?.priority_map_meta.is_capped ? 'bounded sample · true mix first' : 'all matched visible'}</span>
              </div>
              <p style={styles.chartCaption}>
                Titik dikelompokkan per kelas risiko model; distribusi asli dibaca dari bar komposisi sebelum scatter. Tooltip tetap menampilkan skor mentah model.
              </p>
              <p style={styles.axisHelper}>X = risk tier; Y = contract value on log scale. Scatter dots are sampled for readability while the distribution strip is the true mix.</p>
              <>
                <RiskDistributionStrip segments={analytics?.donut ?? []} />
                <div ref={scatterRef} style={styles.scatterWrap}>
                  {loading && <span style={styles.chartOverlay}><ChartLoadingBadge label="Updating" /></span>}
                  {points.length === 0 ? (
                    <EmptyState text="Tidak ada titik prioritas untuk filter ini." />
                  ) : scatterWidth > 0 ? (
                    <ScatterChart width={scatterWidth} height={230} margin={{ top: 12, right: 18, bottom: 20, left: 6 }}>
                  <CartesianGrid stroke="rgba(215,209,176,.14)" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="riskTierPosition"
                    name="Tier"
                    domain={[0.5, 3.5]}
                    ticks={[1, 2, 3]}
                    tickFormatter={(value) => riskTierTick(Number(value))}
                    stroke="rgba(255,255,255,.58)"
                    tick={{ fontSize: 10, fontWeight: 700 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(215,209,176,.16)' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="valueScale"
                    name="Nilai Tender"
                    domain={[0, maxValueScale]}
                    width={56}
                    tickFormatter={(value) => compactCurrency(fromLogValue(Number(value)))}
                    stroke="rgba(255,255,255,.58)"
                    tick={{ fontSize: 10, fontWeight: 700 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(215,209,176,.16)' }}
                  />
                  <ZAxis dataKey="visualPriority" range={[56, 210]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '4 4', stroke: 'rgba(215,209,176,.34)' }}
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload as VisualPriorityPoint | undefined;
                      if (!active || !point) return null;
                      return (
                        <div style={styles.tooltip}>
                          <strong>{point.title}</strong>
                          <span>{point.risk_label} · skor mentah model XGBoost {point.risk_score.toFixed(3)}</span>
                          <span>Matrix position: {point.riskTierLabel} tier × nilai tender</span>
                          <span>{point.tender_value_display} · page {point.archive_page}</span>
                        </div>
                      );
                    }}
                  />
                  {RISK_TIERS.map((tier) => (
                    <Scatter
                      key={tier.label}
                      name={tier.label}
                      data={visualPoints.filter((point) => point.riskTierLabel === tier.label)}
                      fill={tier.color}
                      fillOpacity={0.86}
                      stroke="#FFFFFF"
                      strokeWidth={1}
                      onClick={(payload) => {
                        const point = (payload as { payload?: VisualPriorityPoint }).payload;
                        if (point) handleSelectPoint(point);
                      }}
                    />
                  ))}
                    </ScatterChart>
                  ) : null}
                </div>
              </>
              <div style={styles.matrixLegend}>
                {RISK_TIERS.map((tier) => (
                  <span key={tier.label} style={{ ...styles.legendPill, borderColor: `${tier.color}66`, background: tier.glow }}>
                    <span style={{ ...styles.swatch, background: tier.color }} />
                    {tier.short}
                  </span>
                ))}
                <span style={styles.legendNote}>Balanced sample hanya untuk visibilitas scatter; bar komposisi di atas menunjukkan mix arsip sebenarnya.</span>
              </div>
              <div style={styles.pointList} aria-label="Priority point shortcuts">
                {topPoints.map((point) => (
                  <button key={point.archive_id} type="button" style={styles.pointButton} onClick={() => handleSelectPoint(point)}>
                    <MousePointerClick size={13} />
                    <span>
                      <strong>{point.title}</strong>
                      <small>{point.risk_label} · rank {point.filtered_rank.toLocaleString('id-ID')} · archive page {point.archive_page}</small>
                    </span>
                  </button>
                ))}
              </div>
            </article>

            <aside style={styles.focusAside}>
              <div className="card" style={styles.top5List}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 760, color: 'var(--lp-text-soft)' }}>Top 5 Priority</h4>
                {topPoints.map((point, index) => {
                  const tier = RISK_TIERS.find((t) => point.risk_label.includes(t.short)) ?? RISK_TIERS[1];
                  return (
                    <button key={point.archive_id} type="button" style={styles.top5Row} onClick={() => handleSelectPoint(point)}>
                      <span style={styles.top5Rank}>{index + 1}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.case_id?.slice(0, 18) ?? point.title.slice(0, 18)}</strong>
                        <small style={{ color: 'var(--lp-muted)', fontSize: 10 }}>{compactCurrency(point.contract_value)}</small>
                      </span>
                      <span style={{ padding: '2px 6px', borderRadius: 999, fontSize: 9, fontWeight: 780, color: tier.color, background: tier.glow, border: `1px solid ${tier.color}44` }}>{tier.short}</span>
                      <MousePointerClick size={11} style={{ flexShrink: 0, opacity: 0.5 }} />
                    </button>
                  );
                })}
              </div>
              {selectedPoint && <SelectedPriorityDetail point={selectedPoint} onOpen={handleSelectPoint} />}
            </aside>
          </div>
        )}
      </section>

      <div style={styles.grid}>

        <TopPatternsCard patterns={topPatterns} loading={initialLoading} />

        <section className="card" data-testid="analytics-zone-drill" data-zone="drill" style={styles.panel}>
          <h3 style={{ ...styles.panelTitle, marginBottom: 10 }}><MapPinned size={17} color="#D7D1B0" /> Concentration drill-down</h3>
          <RegionalBuyerTabs
            regional={analytics?.regional_concentration ?? []}
            buyer={analytics?.buyer_concentration ?? []}
            regionalNote={analytics?.regional_meta.note}
            activeRisk={activeRisk}
            loading={initialLoading}
          />
        </section>
      </div>

      {analytics && (
        <footer data-testid="analytics-trust-footer" style={styles.trustFooter}>
          <ShieldCheck size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>{formatNumber(analytics.coverage_proof.filtered_heldout_rows)}</strong> held-out rows · {analytics.coverage_proof.eval_claim_note}
          </span>
        </footer>
      )}
    </section>
  );
}

function TopPatternsCard({ patterns, loading }: { patterns: TopPatterns | null; loading: boolean }) {
  return (
    <article className="card" role="region" aria-label="Top Patterns" style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}><UsersRound size={17} color="#D7D1B0" /> Top Patterns</h3>
        <span style={styles.note}>archive summary</span>
      </div>
      {loading ? (
        <ChartLoadingState variant="donut" compact height={166} label="Loading top patterns" detail="Building archive summary" />
      ) : patterns ? (
        <div style={styles.patternGrid}>
          <PatternMetric label="Matched archive rows" value={formatNumber(patterns.matchedRows)} />
          <PatternMetric label="High-risk count/share" value={`${formatNumber(patterns.highRiskCount)} / ${formatPercent(patterns.highRiskShare)}`} />
          <PatternMetric label="Top classified region" value={patterns.topRegion ?? 'Tidak ada region terklasifikasi'} />
          <PatternMetric label="Top buyer group" value={patterns.topBuyer ?? 'Tidak ada buyer terklasifikasi'} />
          <PatternMetric label="Priority sample count" value={`${formatNumber(patterns.priorityReturned)} dari ${formatNumber(patterns.priorityLimit)}`} />
        </div>
      ) : (
        <EmptyState text="Ringkasan pola belum tersedia." />
      )}
    </article>
  );
}

function PatternMetric({ label, value }: { label: string; value: string }) {
  return (
    <span style={styles.patternMetric}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function SelectedPriorityDetail({ point, onOpen }: { point: ArchivePriorityPoint; onOpen: (point: ArchivePriorityPoint) => void }) {
  return (
    <section className="card" role="region" aria-label="Selected priority point detail" style={styles.detailCard}>
      <div style={styles.panelHeader}>
        <h4 style={styles.detailTitle}>Selected priority point</h4>
        <span style={styles.note}>rank {point.filtered_rank.toLocaleString('id-ID')}</span>
      </div>
      <strong style={styles.detailHeadline}>{point.title}</strong>
      <div style={styles.detailGrid}>
        <DetailLine label="Buyer" value={point.buyer} />
        <DetailLine label="Supplier" value={point.supplier} />
        <DetailLine label="Region" value={point.region || 'Tidak terklasifikasi'} />
        <DetailLine label="Risk label" value={point.risk_label} />
        <DetailLine label="Raw XGBoost score" value={point.risk_score.toFixed(3)} />
        <DetailLine label="Contract value" value={point.tender_value_display || compactCurrency(point.contract_value)} />
        <DetailLine label="Archive page" value={point.archive_page.toLocaleString('id-ID')} />
      </div>
      <button type="button" style={styles.detailCta} onClick={() => onOpen(point)}>
        <MousePointerClick size={13} />
        Open archive row
      </button>
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <span style={styles.detailLine}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function RiskDistributionStrip({ segments }: { segments: ArchiveDonutSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (segments.length === 0 || total === 0) return null;
  return (
    <div style={styles.distributionCard} aria-label="True archive risk distribution">
      <div style={styles.distributionHeader}>
        <strong>True filtered archive mix</strong>
        <span>matrix uses balanced sample, not proportional dots</span>
      </div>
      <div style={styles.stackedTrack}>
        {segments.map((segment) => (
          <span
            key={segment.filter_value}
            title={`${segment.label}: ${segment.count.toLocaleString('id-ID')} paket`}
            style={{
              ...styles.stackedSegment,
              width: `${Math.max(1.5, segment.percent)}%`,
              background: segmentColor(segment),
            }}
          />
        ))}
      </div>
      <div style={styles.distributionLegend}>
        {segments.map((segment) => (
          <span key={segment.filter_value} style={styles.distributionItem}>
            <span style={{ ...styles.swatch, background: segmentColor(segment) }} />
            <strong>{segment.label.replace('Risiko ', '')}</strong>
            <small>{segment.count.toLocaleString('id-ID')} · {segment.percent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskDonut({ segments, activeRisk, onRiskFilter }: { segments: ArchiveDonutSegment[]; activeRisk: string; onRiskFilter: (risk: string) => void }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (segments.length === 0) return <EmptyState text="Distribusi risiko belum tersedia." />;
  return (
    <div style={styles.donutList}>
      {segments.map((segment) => {
        const active = activeRisk === segment.filter_value;
        const color = segmentColor(segment);
        return (
          <button
            key={segment.filter_value}
            type="button"
            aria-pressed={active}
            aria-label={`Filter ${segment.filter_value}`}
            onClick={() => onRiskFilter(active ? 'all' : segment.filter_value)}
            style={{ ...styles.donutButton, ...(active ? styles.donutButtonActive : undefined), borderColor: active ? color : 'var(--lp-glass-control-border-subtle)' }}
          >
            <span style={{ ...styles.swatch, background: color }} />
            <span>
              <strong>{segment.label}</strong>
              <small>{segment.count.toLocaleString('id-ID')} paket · {(total ? segment.percent : 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ConcentrationList({ items, empty, showUnclassified = false }: { items: ArchiveConcentrationItem[]; empty: string; showUnclassified?: boolean }) {
  const unclassified = showUnclassified ? items.filter(isUnclassifiedRegion) : [];
  const classified = (showUnclassified ? items.filter((item) => !isUnclassifiedRegion(item)) : items).slice(0, 6);
  const max = Math.max(1, ...classified.map((item) => item.high_risk_count));
  if (classified.length === 0 && unclassified.length === 0) return <EmptyState text={empty} />;
  const unclassifiedSummary = summarizeConcentration(unclassified);

  return (
    <div style={styles.concentrationList}>
      {classified.map((item) => {
        const value = item.high_risk_count;
        return (
          <div key={item.label} style={styles.concentrationItem}>
            <div style={styles.concentrationTop}>
              <strong>{item.label}</strong>
              <span>{item.high_risk_count.toLocaleString('id-ID')} high</span>
            </div>
            <div style={styles.barTrack} aria-hidden="true"><span style={{ ...styles.barFill, width: `${(value / max) * 100}%` }} /></div>
            <small style={styles.metaLine}>{item.count.toLocaleString('id-ID')} paket · avg score {item.average_risk_score.toFixed(3)} · {compactCurrency(item.total_contract_value)}</small>
          </div>
        );
      })}
      {unclassifiedSummary && (
        <div style={styles.unclassifiedTile}>
          <div style={styles.concentrationTop}>
            <strong>Tidak terklasifikasi</strong>
            <span>{unclassifiedSummary.high_risk_count.toLocaleString('id-ID')} high</span>
          </div>
          <small style={styles.metaLine}>{unclassifiedSummary.count.toLocaleString('id-ID')} paket · Tidak terdeteksi dari nama buyer</small>
        </div>
      )}
    </div>
  );
}

function DerivationBanner({ text }: { text: string }) {
  return <p style={styles.derivationBanner}><Info size={13} aria-hidden="true" /> {text}</p>;
}

function RegionalBuyerTabs({ regional, buyer, regionalNote, activeRisk, loading }: { regional: ArchiveConcentrationItem[]; buyer: ArchiveConcentrationItem[]; regionalNote?: string; activeRisk: string; loading: boolean }) {
  const [activeTab, setActiveTab] = useState<'regional' | 'buyer'>('regional');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setActiveTab('regional');
  }, [activeRisk]);

  if (loading) return <ZoneSkeleton height={200} label="Loading concentration data" />;

  const tabs = ['regional', 'buyer'] as const;

  function handleKeyDown(e: { key: string; preventDefault: () => void }) {
    const current = tabs.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (current + 1) % tabs.length;
      setActiveTab(tabs[next]);
      tabRefs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (current - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prev]);
      tabRefs.current[prev]?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Concentration view" style={styles.tabList} onKeyDown={handleKeyDown}>
        <button
          ref={(el) => { tabRefs.current[0] = el; }}
          role="tab"
          id="tab-regional"
          aria-selected={activeTab === 'regional'}
          aria-controls="tab-panel-regional"
          tabIndex={activeTab === 'regional' ? 0 : -1}
          style={activeTab === 'regional' ? { ...styles.tabBtn, ...styles.tabBtnActive } : styles.tabBtn}
          onClick={() => setActiveTab('regional')}
          type="button"
        >
          Regional Risk Concentration
        </button>
        <button
          ref={(el) => { tabRefs.current[1] = el; }}
          role="tab"
          id="tab-buyer"
          aria-selected={activeTab === 'buyer'}
          aria-controls="tab-panel-buyer"
          tabIndex={activeTab === 'buyer' ? 0 : -1}
          style={activeTab === 'buyer' ? { ...styles.tabBtn, ...styles.tabBtnActive } : styles.tabBtn}
          onClick={() => setActiveTab('buyer')}
          type="button"
        >
          Top Buyer Risk Concentration
        </button>
      </div>
      {activeTab === 'regional' && (
        <section role="tabpanel" id="tab-panel-regional" aria-label="Regional Risk Concentration" aria-labelledby="tab-regional" style={styles.tabPanel}>
          <DerivationBanner text={regionalNote ?? 'Buyer region is derived from buyer name text, not official geolocation.'} />
          <ConcentrationList items={regional} empty="Tidak ada data konsentrasi regional." showUnclassified />
        </section>
      )}
      {activeTab === 'buyer' && (
        <section role="tabpanel" id="tab-panel-buyer" aria-label="Top Buyer Risk Concentration" aria-labelledby="tab-buyer" style={styles.tabPanel}>
          <ConcentrationList items={buyer} empty="Tidak ada data konsentrasi pembeli." />
        </section>
      )}
    </div>
  );
}

function isUnclassifiedRegion(item: ArchiveConcentrationItem) {
  const normalized = (item.label || item.region || '').trim().toLowerCase();
  return item.region_type === 'unknown' || UNCLASSIFIED_REGION_LABELS.includes(normalized);
}

function summarizeConcentration(items: ArchiveConcentrationItem[]) {
  if (items.length === 0) return null;
  return items.reduce((summary, item) => ({
    count: summary.count + item.count,
    high_risk_count: summary.high_risk_count + item.high_risk_count,
  }), { count: 0, high_risk_count: 0 });
}

function buildTopPatterns(analytics: ArchiveAnalyticsResponse): TopPatterns {
  const matchedRows = analytics.counts.matched_count;
  const highRiskCount = getHighRiskCount(analytics);
  const classifiedRegion = analytics.regional_concentration.find((item) => !isUnclassifiedRegion(item));
  const topBuyer = analytics.buyer_concentration[0];

  return {
    matchedRows,
    highRiskCount,
    highRiskShare: matchedRows > 0 ? (highRiskCount / matchedRows) * 100 : 0,
    topRegion: classifiedRegion?.label ?? null,
    topBuyer: topBuyer?.label ?? null,
    priorityReturned: analytics.priority_map_meta.points_returned,
    priorityLimit: analytics.priority_map_meta.point_limit,
  };
}

function getHighRiskCount(analytics: ArchiveAnalyticsResponse) {
  const distribution = analytics.counts.risk_distribution;
  const direct = distribution.Risiko_Tinggi ?? distribution['Risiko Tinggi'] ?? distribution.tinggi ?? distribution.high;
  if (typeof direct === 'number') return direct;
  return analytics.donut.find((segment) => segment.label.includes('Tinggi'))?.count ?? 0;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span style={styles.metric}>
      <span style={styles.metricIcon}>{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={styles.empty}>{text}</p>;
}

function ZoneSkeleton({ height, label }: { height: number; label: string }) {
  return <ChartLoadingState variant="matrix" height={height} label={label} detail="" />;
}

function formatNumber(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('id-ID') : '—';
}

function formatPercent(value: number) {
  return `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
}

function segmentColor(segment: ArchiveDonutSegment) {
  if (segment.label.includes('Tinggi')) return '#E05A4F';
  if (segment.label.includes('Sedang')) return '#D8A42F';
  if (segment.label.includes('Rendah')) return '#4FA66A';
  return segment.color || '#d7d1b0';
}

function compactCurrency(value?: number | null) {
  const amount = value ?? 0;
  if (amount >= 1_000_000_000_000) return `Rp${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000) return `Rp${(amount / 1_000_000_000).toFixed(1)}M`;
  if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toFixed(0)}jt`;
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function toVisualPriorityPoint(point: ArchivePriorityPoint): VisualPriorityPoint {
  const tier = riskTier(point.risk_label);
  const rawValue = Math.max(0, point.contract_value ?? 0);
  const valueScale = Math.log10(rawValue + 1);
  const rankJitter = (((point.filtered_rank % 17) - 8) / 40);
  const confidenceJitter = Math.max(-0.14, Math.min(0.14, (point.risk_score - 0.5) * 0.18));
  return {
    ...point,
    riskTierPosition: tier.position + rankJitter + confidenceJitter,
    riskTierLabel: tier.label,
    valueScale,
    visualPriority: 1 + point.risk_score * 4 + Math.min(3, valueScale / 4),
  };
}

function riskTier(label: string) {
  return RISK_TIERS.find((tier) => label.includes(tier.short)) ?? RISK_TIERS[1];
}

function riskTierTick(value: number) {
  return RISK_TIERS.find((tier) => tier.position === value)?.short ?? '';
}

function fromLogValue(value: number) {
  return Math.max(0, Math.pow(10, value) - 1);
}

const styles: Record<string, CSSProperties> = {
  shell: { display: 'grid', gap: 14, overflow: 'visible', background: 'transparent' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' },
  title: { margin: '7px 0 3px', fontSize: 22, lineHeight: 1.05, letterSpacing: '-.035em' },
  muted: { margin: 0, color: 'var(--lp-muted)', fontSize: 12, lineHeight: 1.35, maxWidth: 720 },
  zoneState: { display: 'grid', gap: 12 },
  zoneHeading: { margin: 0, fontSize: 15, lineHeight: 1.1, letterSpacing: '-.02em' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(110px, 1fr))', gap: 8 },
  zoneStateGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 },
  panel: { minWidth: 0, padding: 14, border: '1px solid rgba(215,209,176,.14)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)', overflow: 'hidden' },
  stateRiskCard: { minWidth: 0, padding: 14, border: '1px solid rgba(215,209,176,.14)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)', overflow: 'hidden' },
  priorityPanel: { gridColumn: '1 / -1' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 },
  panelTitle: { margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, lineHeight: 1.1 },
  note: { color: 'var(--lp-muted)', fontSize: 10, fontWeight: 760, letterSpacing: '.03em' },
  caveatChip: { display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '4px 8px', borderRadius: 999, color: 'var(--lp-bg-deep)', background: 'var(--lp-cream)', fontSize: 10, fontWeight: 820, letterSpacing: '.03em' },
  chartCaption: { margin: '-2px 0 8px', color: 'var(--lp-text-soft)', fontSize: 11, lineHeight: 1.3, borderLeft: '2px solid var(--lp-cream)', paddingLeft: 8 },
  axisHelper: { margin: '0 0 8px', color: 'var(--lp-muted)', fontSize: 11, lineHeight: 1.3 },
  scatterWrap: { height: 232, minWidth: 0, position: 'relative' },
  chartOverlay: { position: 'absolute', top: 6, right: 6, zIndex: 3 },
  tooltip: { display: 'grid', gap: 4, maxWidth: 260, padding: 10, color: 'var(--lp-text)', background: '#201F1E', border: '1px solid rgba(215,209,176,.24)', borderRadius: 18, boxShadow: 'var(--lp-shadow)' },
  distributionCard: { display: 'grid', gap: 7, marginBottom: 8, padding: 9, border: '1px solid rgba(255,255,255,.075)', borderRadius: 16, background: 'rgba(255,255,255,.035)' },
  distributionHeader: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', color: 'var(--lp-text-soft)', fontSize: 11, lineHeight: 1.2 },
  stackedTrack: { display: 'flex', height: 9, overflow: 'hidden', border: '1px solid rgba(215,209,176,.16)', borderRadius: 999, background: 'rgba(255,255,255,.06)' },
  stackedSegment: { display: 'block', minWidth: 4, height: '100%' },
  distributionLegend: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 },
  distributionItem: { minWidth: 0, display: 'grid', gridTemplateColumns: '12px minmax(44px, auto) minmax(0, 1fr)', gap: 5, alignItems: 'center', color: 'var(--lp-muted)', fontSize: 10 },
  matrixLegend: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  legendPill: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid', borderRadius: 999, color: 'var(--lp-text-soft)', fontSize: 10, fontWeight: 760, letterSpacing: '.03em' },
  legendNote: { color: 'var(--lp-muted)', fontSize: 10, marginLeft: 2 },
  pointList: { display: 'grid', gap: 6, marginTop: 6 },
  pointButton: { display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 8, alignItems: 'center', textAlign: 'left', padding: '8px 9px', borderRadius: 16, color: 'var(--lp-text-soft)', cursor: 'pointer', ...glassSubtleSurface },
  donutList: { display: 'grid', gap: 8 },
  donutButton: { display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 10px', borderRadius: 16, color: 'var(--lp-text)', cursor: 'pointer', ...glassSubtleSurface },
  donutButtonActive: { ...glassCreamSurface, color: 'var(--lp-bg-deep)' },
  swatch: { width: 11, height: 11, borderRadius: 999, boxShadow: 'none' },
  patternGrid: { display: 'grid', gap: 7 },
  patternMetric: { display: 'grid', gap: 2, padding: '8px 9px', border: '1px solid rgba(255,255,255,.065)', borderRadius: 14, background: 'rgba(255,255,255,.03)', color: 'var(--lp-text-soft)' },
  concentrationList: { display: 'grid', gap: 8 },
  concentrationItem: { display: 'grid', gap: 5 },
  concentrationTop: { display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--lp-text-soft)', fontSize: 12 },
  barTrack: { height: 9, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(215,209,176,.13)', borderRadius: 999, overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', background: 'var(--lp-cream)' },
  metaLine: { color: 'var(--lp-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  footnote: { margin: '0 0 8px', color: 'var(--lp-text-soft)', fontSize: 11, lineHeight: 1.25 },
  derivationBanner: { display: 'flex', alignItems: 'start', gap: 7, margin: '0 0 8px', padding: '8px 9px', border: '1px solid rgba(216,164,47,.3)', borderRadius: 14, color: 'var(--lp-text-soft)', background: 'rgba(216,164,47,.1)', fontSize: 11, lineHeight: 1.3 },
  unclassifiedTile: { display: 'grid', gap: 5, marginTop: 2, padding: '8px 9px', border: '1px dashed rgba(215,209,176,.28)', borderRadius: 14, background: 'rgba(215,209,176,.055)' },
  tabList: { display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid rgba(215,209,176,.15)', paddingBottom: 0 },
  tabBtn: { padding: '6px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '.02em', background: 'none', border: 'none', borderBottom: '2px solid transparent', borderRadius: 0, color: 'var(--lp-muted)', cursor: 'pointer', transition: 'color .15s, border-color .15s' },
  tabBtnActive: { color: 'var(--lp-text)', borderBottomColor: '#D8A42F' },
  tabPanel: { paddingTop: 4, ...glassSubtleSurface, borderRadius: 12, padding: 10 },
  coverage: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 220px)) minmax(0, 1fr)', gap: 8, alignItems: 'stretch' },
  coverageNote: { border: '1px solid rgba(215,209,176,.22)', borderRadius: 16, padding: '8px 10px', color: 'var(--lp-bg-deep)', background: 'rgba(215,209,176,.08)', fontSize: 11, lineHeight: 1.3 },
  metric: { minWidth: 0, display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 7, alignItems: 'center', padding: '8px 9px', border: '1px solid rgba(255,255,255,.075)', borderRadius: 16, background: 'rgba(255,255,255,.035)', color: 'var(--lp-text)' },
  metricIcon: { width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 999, ...glassCreamIcon },
   error: { margin: 0, color: '#E05A4F', border: '1px solid rgba(224,90,79,.3)', borderRadius: 16, padding: 10, background: 'rgba(224,90,79,.1)' },
   empty: { margin: 0, minHeight: 80, display: 'grid', placeItems: 'center', color: 'var(--lp-muted)', textAlign: 'center', fontSize: 12 },
  trustFooter: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 12, opacity: 0.78, color: 'var(--lp-text-soft)', flexWrap: 'wrap' },
  zoneFocusGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 },
  focusAside: { minWidth: 280, display: 'grid', gap: 10, alignContent: 'start' },
  top5List: { padding: 14, border: '1px solid rgba(215,209,176,.14)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)', display: 'grid', gap: 6, alignContent: 'start' },
  top5Row: { display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' as const, padding: '7px 9px', borderRadius: 14, color: 'var(--lp-text-soft)', cursor: 'pointer', border: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.03)', transition: 'background .15s' },
  top5Rank: { width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: 999, fontSize: 10, fontWeight: 820, color: 'var(--lp-bg-deep)', background: 'var(--lp-cream)', flexShrink: 0 },
  detailCard: { display: 'grid', gap: 8, padding: 14, border: '1px solid rgba(215,209,176,.18)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-panel)' },
  detailTitle: { margin: 0, color: 'var(--lp-text-soft)', fontSize: 13, lineHeight: 1.15 },
  detailHeadline: { color: 'var(--lp-text)', fontSize: 12, lineHeight: 1.25 },
  detailGrid: { display: 'grid', gap: 6 },
  detailLine: { display: 'grid', gap: 1, minWidth: 0, color: 'var(--lp-text-soft)' },
  detailCta: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 2, padding: '8px 10px', borderRadius: 14, color: 'var(--lp-bg-deep)', cursor: 'pointer', ...glassCreamSurface },
};
