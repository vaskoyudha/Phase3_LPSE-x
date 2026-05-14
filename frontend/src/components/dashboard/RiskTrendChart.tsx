import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import {
  BarChart as EchartsBarChart,
  LineChart,
  type BarSeriesOption,
  type LineSeriesOption,
} from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
  type DataZoomComponentOption,
  type GridComponentOption,
  type LegendComponentOption,
  type MarkPointComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { BarChart3 } from 'lucide-react';
import type { ArchiveMonthlyRiskTrend } from '../../types/api';
import { ChartLoadingBadge, ChartLoadingState } from './ChartLoadingState';

const TREND_CHART_MIN_HEIGHT = 174;

echarts.use([
  EchartsBarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  SVGRenderer,
]);

type TrendRow = {
  month: string;
  tinggi: number;
  sedang: number;
  rendah: number;
  total: number;
};

type TrendChartOption = echarts.ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | MarkPointComponentOption
>;

export function RiskTrendChart({ trend, dateRange, loading = false }: { trend: ArchiveMonthlyRiskTrend[]; dateRange?: { start_month: string | null; end_month: string | null }; loading?: boolean }) {
  const rows = trend.map((entry) => ({
    month: entry.month,
    tinggi: entry.tinggi,
    sedang: entry.sedang,
    rendah: entry.rendah,
    total: entry.tinggi + entry.sedang + entry.rendah,
  }));
  const peak = Math.max(0, ...rows.map((row) => row.total));
  const rangeLabel = loading && rows.length === 0 ? 'loading arsip' : dateRange?.start_month && dateRange.end_month ? `${formatMonth(dateRange.start_month)}–${formatMonth(dateRange.end_month)}` : `${rows.length} bulan arsip`;
  const initialLoading = loading && rows.length === 0;
  const option = useMemo(() => buildTrendOption(rows), [rows]);

  return (
    <section className="card risk-trend-card" style={{ padding: '16px 16px 10px', minHeight: 274, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, letterSpacing: '-.025em' }}><BarChart3 size={18} color="#D7D1B0" /> Tren Risiko Arsip per Bulan</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: 'var(--lp-muted)', fontSize: 12, fontWeight: 760 }}>
          <span>{rangeLabel}</span>
          <span>{loading ? <ChartLoadingBadge label="Loading trend" /> : `Peak ${peak.toLocaleString('id-ID')} paket`}</span>
        </div>
      </div>
      <div className="risk-trend-echarts" style={{ height: '100%', minHeight: TREND_CHART_MIN_HEIGHT, marginTop: 8, minWidth: 0, position: 'relative' }}>
        {initialLoading ? (
          <ChartLoadingState variant="bars" compact height={TREND_CHART_MIN_HEIGHT} label="Loading monthly trend" detail="Aggregating archive risk by month" />
        ) : rows.length === 0 ? (
          <p style={{ margin: '42px 0 0', color: '#9d968a', textAlign: 'center', fontSize: 12 }}>Tren arsip belum tersedia untuk filter ini.</p>
        ) : (
          <>
            {loading && <span style={{ position: 'absolute', top: 4, right: 6, zIndex: 3 }}><ChartLoadingBadge label="Updating" /></span>}
            <TrendEChart option={option} rows={rows} />
          </>
        )}
      </div>
    </section>
  );
}

function TrendEChart({ option, rows }: { option: TrendChartOption; rows: TrendRow[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
    const host = chartRef.current;
    if (!host) return undefined;

    if (typeof window === 'undefined' || window.navigator.userAgent.toLowerCase().includes('jsdom')) {
      setFallback(true);
      return undefined;
    }

    let chart: echarts.ECharts | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFrame = 0;

    const resize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => chart?.resize());
    };

    try {
      chart = echarts.getInstanceByDom(host) ?? echarts.init(host, undefined, { renderer: 'svg' });
      chart.setOption(option, { notMerge: true, lazyUpdate: true });
      window.setTimeout(resize, 0);
      window.addEventListener('resize', resize);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      }
    } catch (error) {
      console.error('Risk trend chart failed to render; showing static fallback.', error);
      setFallback(true);
      chart?.dispose();
      return undefined;
    }

    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      chart?.dispose();
    };
  }, [option]);

  if (fallback) return <StaticTrendFallback rows={rows} />;

  return <div ref={chartRef} role="img" aria-label="Tren risiko arsip per bulan" style={{ width: '100%', height: '100%' }} />;
}

function StaticTrendFallback({ rows }: { rows: TrendRow[] }) {
  const visibleRows = rows.slice(-12);
  const maxTotal = Math.max(1, ...visibleRows.map((row) => row.total));

  return (
    <div aria-label="Fallback tren risiko arsip per bulan" style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 8, padding: '10px 2px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleRows.length}, minmax(8px, 1fr))`, gap: 7, alignItems: 'end', minHeight: 0 }}>
        {visibleRows.map((row) => {
          const totalHeight = Math.max(10, (row.total / maxTotal) * 100);
          return (
            <div key={row.month} title={`${row.month}: ${row.total.toLocaleString('id-ID')} paket`} style={{ height: '100%', display: 'flex', alignItems: 'end' }}>
              <div style={{ width: '100%', height: `${totalHeight}%`, minHeight: 12, display: 'flex', flexDirection: 'column-reverse', borderRadius: 0, overflow: 'hidden', background: 'rgba(255,255,255,.05)', boxShadow: '0 0 0 1px rgba(215,209,176,.08)' }}>
                <span style={{ flex: Math.max(row.rendah, 0), minHeight: row.rendah ? 2 : 0, background: '#4FA66A' }} />
                <span style={{ flex: Math.max(row.sedang, 0), minHeight: row.sedang ? 2 : 0, background: '#D8A42F' }} />
                <span style={{ flex: Math.max(row.tinggi, 0), minHeight: row.tinggi ? 2 : 0, background: '#E05A4F' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleRows.length}, minmax(8px, 1fr))`, gap: 7, color: 'rgba(255,255,255,.48)', fontSize: 9, fontWeight: 800 }}>
        {visibleRows.map((row) => <span key={row.month} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatMonth(row.month, 'short')}</span>)}
      </div>
    </div>
  );
}

function formatMonth(value: string, month: 'short' | 'long' = 'short') {
  const [year, monthNumber] = value.split('-').map(Number);
  if (!year || !monthNumber) return value;
  return new Intl.DateTimeFormat('id-ID', { month, year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function buildTrendOption(rows: TrendRow[]): TrendChartOption {
  const months = rows.map((row) => row.month);
  const shouldZoom = rows.length > 12;
  const zoomStart = shouldZoom ? Math.max(0, 100 - (12 / rows.length) * 100) : 0;

  return {
    backgroundColor: 'transparent',
    animationDuration: 780,
    animationEasing: 'cubicOut',
    color: ['#4FA66A', '#D8A42F', '#E05A4F', '#d7d1b0'],
    textStyle: {
      fontFamily: 'Space Grotesk, Aptos, Segoe UI, sans-serif',
      color: 'rgba(255,255,255,.72)',
    },
    grid: {
      left: 44,
      right: 20,
      top: 26,
      bottom: shouldZoom ? 36 : 22,
      containLabel: false,
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 12,
      textStyle: {
        color: 'rgba(255,255,255,.58)',
        fontSize: 11,
        fontWeight: 800,
      },
      data: ['Rendah', 'Sedang', 'Tinggi', 'Total'],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: 'rgba(215,209,176,.07)' },
      },
      borderWidth: 1,
      borderColor: 'rgba(215,209,176,.22)',
      backgroundColor: 'rgba(32,31,30,.94)',
      textStyle: {
        color: '#fff',
        fontFamily: 'Space Grotesk, Aptos, Segoe UI, sans-serif',
        fontSize: 12,
      },
      valueFormatter: (value) => `${Number(value ?? 0).toLocaleString('id-ID')} paket`,
    },
    xAxis: {
      type: 'category',
      data: months,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(215,209,176,.18)' } },
      axisLabel: {
        color: 'rgba(255,255,255,.58)',
        fontSize: 11,
        fontWeight: 800,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      splitNumber: 3,
      axisLabel: {
        color: 'rgba(255,255,255,.52)',
        fontSize: 11,
        fontWeight: 760,
        formatter: (value: number) => value.toLocaleString('id-ID'),
      },
      splitLine: { lineStyle: { color: 'rgba(215,209,176,.12)' } },
    },
    dataZoom: shouldZoom ? [
      {
        type: 'inside',
        start: zoomStart,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: true,
        moveOnMouseMove: true,
      },
      {
        type: 'slider',
        start: zoomStart,
        end: 100,
        height: 10,
        bottom: 2,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255,255,255,.045)',
        fillerColor: 'rgba(215,209,176,.22)',
        handleSize: 0,
        showDetail: false,
        showDataShadow: false,
      },
    ] : undefined,
    series: [
      buildStackedBar('Rendah', rows.map((row) => row.rendah), '#4FA66A'),
      buildStackedBar('Sedang', rows.map((row) => row.sedang), '#D8A42F'),
      buildStackedBar('Tinggi', rows.map((row) => row.tinggi), '#E05A4F'),
      {
        name: 'Total',
        type: 'line',
        data: rows.map((row) => row.total),
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: rows.length <= 16,
        z: 5,
        lineStyle: {
          width: 2.5,
          color: '#d7d1b0',
          shadowColor: 'rgba(215,209,176,.36)',
          shadowBlur: 8,
        },
        itemStyle: {
          color: '#ebe6c9',
          borderColor: '#11100f',
          borderWidth: 2,
        },
        areaStyle: {
          opacity: 0.14,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(215,209,176,.36)' },
            { offset: 1, color: 'rgba(215,209,176,0)' },
          ]),
        },
        markPoint: {
          symbol: 'pin',
          symbolSize: 38,
          label: {
            color: '#11100f',
            fontSize: 10,
            fontWeight: 900,
            formatter: 'Peak',
          },
          itemStyle: {
            color: '#ebe6c9',
            borderColor: 'rgba(17,16,15,.2)',
            borderWidth: 1,
          },
          data: [{ type: 'max', name: 'Peak' }],
        },
        emphasis: {
          focus: 'series',
        },
      },
    ],
  };
}

function buildStackedBar(name: string, data: number[], color: string): BarSeriesOption {
  return {
    name,
    type: 'bar',
    stack: 'risk',
    data,
    barWidth: '52%',
    itemStyle: {
      borderRadius: 0,
      color,
      shadowColor: 'rgba(17,16,15,.18)',
      shadowBlur: 5,
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowColor: 'rgba(235,230,201,.28)',
        shadowBlur: 14,
      },
    },
  };
}
