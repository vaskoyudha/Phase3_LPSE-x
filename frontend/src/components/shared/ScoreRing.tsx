import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as echarts from 'echarts/core';
import { GaugeChart, type GaugeSeriesOption } from 'echarts/charts';
import { SVGRenderer } from 'echarts/renderers';
import { normalizeRiskTone, riskToneColor, type RiskTone } from './riskTone';

echarts.use([GaugeChart, SVGRenderer]);

type ScoreRingProps = {
  score: number;
  label?: string;
  tone?: RiskTone;
  riskLabel?: string | null;
  size?: number;
  className?: string;
};

type GaugeOption = echarts.ComposeOption<GaugeSeriesOption>;

const ZONE_LOW = '#4FA66A';
const ZONE_MID = '#D8A42F';
const ZONE_HIGH = '#E05A4F';

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score <= 1) return Math.max(0, Math.min(100, score * 100));
  return Math.max(0, Math.min(100, score));
}

export function ScoreRing({ score, label = 'prioritas', tone, riskLabel, size = 140, className }: ScoreRingProps) {
  const value = clampScore(score);
  const resolvedTone = tone ?? normalizeRiskTone(riskLabel);
  const accent = riskToneColor(resolvedTone);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  const option = useMemo<GaugeOption>(() => ({
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '88%',
        center: ['50%', '58%'],
        progress: { show: false },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.4, ZONE_LOW],
              [0.7, ZONE_MID],
              [1, ZONE_HIGH],
            ],
          },
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '62%',
          width: 10,
          offsetCenter: [0, '-10%'],
          itemStyle: {
            color: 'auto',
            shadowColor: 'rgba(0,0,0,.6)',
            shadowBlur: 8,
            shadowOffsetY: 3,
          },
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 14,
          itemStyle: { borderColor: 'auto', borderWidth: 3, color: 'rgba(17,16,15,.95)' },
        },
        axisTick: {
          distance: -14,
          length: 4,
          lineStyle: { color: 'rgba(255,255,255,.45)', width: 1 },
        },
        splitLine: {
          distance: -16,
          length: 7,
          lineStyle: { color: 'rgba(255,255,255,.7)', width: 2 },
        },
        axisLabel: { show: false },
        title: {
          show: false,
        },
        detail: {
          show: false,
        },
        data: [{ value: Math.round(value), name: label.toUpperCase() }],
      },
    ],
  }), [value, label]);

  useEffect(() => {
    setFallback(false);
    const host = hostRef.current;
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
      console.error('Score gauge failed to render; showing static fallback.', error);
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

  const wrapperStyle: CSSProperties & { '--score-ring-size': string; '--score-ring-color': string } = {
    '--score-ring-size': `${size}px`,
    '--score-ring-color': accent,
  };

  return (
    <div
      className={['score-ring', 'score-ring--gauge', className].filter(Boolean).join(' ')}
      style={wrapperStyle}
      role="img"
      aria-label={`${label} ${value.toFixed(1)} persen`}
    >
      {fallback ? (
        <StaticGaugeFallback value={value} accent={accent} label={label} />
      ) : (
        <div ref={hostRef} className="score-ring__chart" />
      )}
    </div>
  );
}

function StaticGaugeFallback({ value, accent, label }: { value: number; accent: string; label: string }) {
  return (
    <div className="score-ring__fallback">
      <strong className="score-ring__fallback-value" style={{ color: accent }}>{value.toFixed(0)}%</strong>
      <span className="score-ring__fallback-label">{label}</span>
    </div>
  );
}
