import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import nusantaraSvgRaw from '../../assets/maps/nusantara-quest-indonesia.svg?raw';
import { ISLAND_GROUPS, DEFAULT_ISLAND_ID } from './nusantaraIslandGroups';
import { KABUPATEN_TO_PROVINCE } from './kabupatenToProvince';
import {
  CODE_BY_NORMALIZED_NAME,
  normalizeProvinceKey,
} from './nusantaraProvinceCodes';
import type { ArchiveAnalyticsResponse } from '../../types/api';

const NON_GEO_IDS = new Set([
  'wrapper',
  'map',
  'map-group',
  'svg-background',
  'credit-text-svg',
  'credit-tspan-svg',
]);
const NON_GEO_PREFIXES = ['pattern', 'texture', 'stripes', 'hatch', 'noise', 'defs'];

const ISLAND_ORDER = [
  'sumatera',
  'jawa',
  'kalimantan',
  'sulawesi',
  'nusa_tenggara',
  'maluku',
  'papua',
] as const;
type IslandId = (typeof ISLAND_ORDER)[number];

const ISLAND_FILL: Record<string, string> = {
  sumatera: '#6d6757',
  jawa: '#7a7464',
  kalimantan: '#5f5a55',
  sulawesi: '#6d6757',
  nusa_tenggara: '#7a7464',
  maluku: '#8c866f',
  papua: '#5f5a55',
};
const ISLAND_HIGH_FILL: Record<string, string> = {
  sumatera: '#9c3e36',
  jawa: '#9c3e36',
  kalimantan: '#9c3e36',
  sulawesi: '#9c3e36',
  nusa_tenggara: '#9c3e36',
  maluku: '#9c3e36',
  papua: '#9c3e36',
};
const DIM_FILL = '#a89f7c';
const VIEWBOX_TRANSITION_MS = 900;
const AUTO_ROTATE_MS = 5000;

interface NusantaraPath {
  id: string;
  d: string;
  islandId: string | null;
}

const warnedUnknown = new Set<string>();

function parseNusantaraPaths(): NusantaraPath[] {
  const results: NusantaraPath[] = [];
  // Handle both attribute orders: id first or d first
  const re1 = /<path\s[^>]*\bid="([^"]+)"[^>]*\bd="([^"]+)"[^>]*\/?>/g;
  const re2 = /<path\s[^>]*\bd="([^"]+)"[^>]*\bid="([^"]+)"[^>]*\/?>/g;
  const seen = new Set<string>();

  for (const re of [re1, re2]) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(nusantaraSvgRaw)) !== null) {
      const [, a, b] = m;
      const id = re === re1 ? a : b;
      const d = re === re1 ? b : a;
      if (seen.has(id)) continue;
      if (NON_GEO_IDS.has(id)) continue;
      if (NON_GEO_PREFIXES.some((p) => id.startsWith(p))) continue;
      seen.add(id);

      const provinceCode = KABUPATEN_TO_PROVINCE[id];
      if (!provinceCode) {
        if (import.meta.env.DEV && !warnedUnknown.has(id)) {
          console.warn('[NusantaraAtlasCarousel] unknown path id:', id);
          warnedUnknown.add(id);
        }
        results.push({ id, d, islandId: null });
        continue;
      }
      const island = ISLAND_GROUPS.find((g) => g.provinceCodes.includes(provinceCode));
      results.push({ id, d, islandId: island?.id ?? null });
    }
  }
  return results;
}

const NUSANTARA_PATHS = parseNusantaraPaths();

interface IslandMetric {
  count: number;
  highRiskCount: number;
}

function aggregateIslandMetrics(
  analytics: ArchiveAnalyticsResponse | null,
): Record<string, IslandMetric> {
  const result: Record<string, IslandMetric> = {};
  ISLAND_ORDER.forEach((id) => {
    result[id] = { count: 0, highRiskCount: 0 };
  });
  if (!analytics?.region_map) return result;

  analytics.region_map.forEach((item) => {
    const normalized = normalizeProvinceKey(item.province ?? item.label ?? '');
    const code = CODE_BY_NORMALIZED_NAME[normalized];
    if (!code) return;
    const island = ISLAND_GROUPS.find((g) => g.provinceCodes.includes(code));
    if (!island) return;
    result[island.id].count += item.count;
    result[island.id].highRiskCount += item.high_risk_count;
  });
  return result;
}

interface NusantaraAtlasCarouselProps {
  analytics: ArchiveAnalyticsResponse | null;
  onNavigate?: (tab: string) => void;
}

const CONTAINER_ASPECT = 16 / 7;

function fitBBToAspect(bb: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  let w = bb.width;
  let h = bb.height;
  const bbAspect = w / h;

  if (bbAspect < CONTAINER_ASPECT) {
    w = h * CONTAINER_ASPECT;
  } else {
    h = w / CONTAINER_ASPECT;
  }

  w *= 1.05;
  h *= 1.05;

  return [cx - w / 2, cy - h / 2, w, h];
}

export function NusantaraAtlasCarousel({
  analytics,
  onNavigate: _onNavigate,
}: NusantaraAtlasCarouselProps) {
  const defaultIdx = ISLAND_ORDER.indexOf(DEFAULT_ISLAND_ID as IslandId);
  const [activeIdx, setActiveIdx] = useState(defaultIdx >= 0 ? defaultIdx : 1);
  const [paused, setPaused] = useState(false);

  const activeIsland = ISLAND_GROUPS.find((g) => g.id === ISLAND_ORDER[activeIdx])!;
  const targetBB = activeIsland.boundingBox;

  const initialVB = fitBBToAspect(targetBB);

  const animRef = useRef<number | null>(null);
  const fromVBRef = useRef<[number, number, number, number]>(initialVB);
  const toVBRef = useRef<[number, number, number, number]>(initialVB);
  const startTimeRef = useRef<number | null>(null);
  const [viewBox, setViewBox] = useState<[number, number, number, number]>(initialVB);

  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // Navigate to island by index
  const navigateTo = (idx: number) => {
    const island = ISLAND_GROUPS.find((g) => g.id === ISLAND_ORDER[idx])!;
    const bb = island.boundingBox;
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    fromVBRef.current = [...viewBox] as [number, number, number, number];
    toVBRef.current = fitBBToAspect(bb);
    startTimeRef.current = null;
    setActiveIdx(idx);
  };

  // rAF animation loop — re-runs whenever activeIdx changes
  useEffect(() => {
    const to = toVBRef.current;
    const from = fromVBRef.current;

    if (prefersReducedMotion) {
      setViewBox(to);
      return;
    }

    const animate = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const t = Math.min(1, elapsed / VIEWBOX_TRANSITION_MS);
      const ease = 1 - Math.pow(1 - t, 3); // cubic-out

      const current: [number, number, number, number] = [
        from[0] + (to[0] - from[0]) * ease,
        from[1] + (to[1] - from[1]) * ease,
        from[2] + (to[2] - from[2]) * ease,
        from[3] + (to[3] - from[3]) * ease,
      ];
      setViewBox(current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        fromVBRef.current = to;
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [activeIdx, prefersReducedMotion]);

  // Auto-rotate every AUTO_ROTATE_MS, pauses on hover
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % ISLAND_ORDER.length;
        const island = ISLAND_GROUPS.find((g) => g.id === ISLAND_ORDER[next])!;
        const bb = island.boundingBox;
        if (animRef.current !== null) cancelAnimationFrame(animRef.current);
        fromVBRef.current = [...toVBRef.current] as [number, number, number, number];
        toVBRef.current = fitBBToAspect(bb);
        startTimeRef.current = null;
        return next;
      });
    }, AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  const islandMetrics = aggregateIslandMetrics(analytics);
  const activeMetric = islandMetrics[ISLAND_ORDER[activeIdx]];
  const highRiskShare =
    activeMetric.count > 0 ? activeMetric.highRiskCount / activeMetric.count : 0;
  const isHighRisk = highRiskShare >= 0.15;

  const vbStr = `${viewBox[0]} ${viewBox[1]} ${viewBox[2]} ${viewBox[3]}`;

  const islandLabel = ISLAND_ORDER[activeIdx]
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className="nusantara-atlas-carousel"
      role="region"
      aria-label="Peta Nusantara"
      tabIndex={0}
      style={{
        position: 'relative',
        borderRadius: '24px',
        border: '1px solid #ded8bd',
        background: '#f3eedb',
        overflow: 'hidden',
        outline: 'none',
        width: '100%',
        aspectRatio: '16 / 7',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft')
          navigateTo((activeIdx - 1 + ISLAND_ORDER.length) % ISLAND_ORDER.length);
        if (e.key === 'ArrowRight') navigateTo((activeIdx + 1) % ISLAND_ORDER.length);
      }}
    >
      {/* SVG Map */}
      <svg
        viewBox={vbStr}
        style={{ width: '100%', height: '100%', display: 'block', position: 'absolute', inset: 0 }}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Peta Indonesia — ${activeIsland.nameKey}`}
        role="img"
      >
        {NUSANTARA_PATHS.map(({ id, d, islandId }) => {
          const isActive = islandId === ISLAND_ORDER[activeIdx];
          const fill = isActive
            ? isHighRisk
              ? (ISLAND_HIGH_FILL[islandId!] ?? DIM_FILL)
              : (ISLAND_FILL[islandId!] ?? DIM_FILL)
            : DIM_FILL;
          return (
            <path
              key={id}
              d={d}
              fill={fill}
              stroke="#ffffff"
              strokeWidth={0.3}
            />
          );
        })}
      </svg>

      {/* Metric overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(243,238,219,0.92)',
          borderRadius: '12px',
          padding: '8px 12px',
          border: '1px solid #ded8bd',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#11100F' }}>
          {islandLabel}
        </div>
        {activeMetric.count > 0 ? (
          <div style={{ fontSize: '13px', color: '#5a5550', marginTop: '2px' }}>
            {activeMetric.count.toLocaleString('id-ID')} paket ·{' '}
            <span
              style={{
                color: isHighRisk ? '#E05A4F' : '#4FA66A',
                fontWeight: 600,
              }}
            >
              {activeMetric.highRiskCount.toLocaleString('id-ID')} risiko tinggi (
              {Math.round(highRiskShare * 100)}%)
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#9a9590' }}>Memuat data…</div>
        )}
      </div>

      {/* Left arrow */}
      <button
        aria-label="Pulau sebelumnya"
        onClick={() =>
          navigateTo((activeIdx - 1 + ISLAND_ORDER.length) % ISLAND_ORDER.length)
        }
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-line)',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--lp-cream)',
          backdropFilter: 'var(--lp-glass-blur)',
          boxShadow: 'var(--lp-glass-shadow-soft)',
          transition: 'background 0.15s ease',
        }}
      >
        <CaretLeft size={18} weight="bold" />
      </button>

      {/* Right arrow */}
      <button
        aria-label="Pulau berikutnya"
        onClick={() => navigateTo((activeIdx + 1) % ISLAND_ORDER.length)}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-line)',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--lp-cream)',
          backdropFilter: 'var(--lp-glass-blur)',
          boxShadow: 'var(--lp-glass-shadow-soft)',
          transition: 'background 0.15s ease',
        }}
      >
        <CaretRight size={18} weight="bold" />
      </button>

      {/* Dot indicators */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '6px',
        }}
      >
        {ISLAND_ORDER.map((id, i) => (
          <button
            key={id}
            aria-label={`Navigasi ke ${id}`}
            onClick={() => navigateTo(i)}
            style={{
              width: i === activeIdx ? '20px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i === activeIdx ? (ISLAND_FILL[id] ?? '#888') : '#c8c0a0',
              border: 'none',
              cursor: 'pointer',
              transition: 'width 0.2s ease',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
