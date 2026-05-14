import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CaretLeft, CaretRight, MapTrifold } from '@phosphor-icons/react';
import { geoMercator, geoPath } from 'd3-geo';
import type { ExtendedFeature, ExtendedFeatureCollection } from 'd3-geo';
import type { ArchiveAnalyticsResponse, ArchiveRegionMapItem } from '../../types/api';
import { mapData, mapFeatures } from './regionGeometry';
import type { MapFeature } from './regionGeometry';

type D3MapFeature = ExtendedFeature<NonNullable<ExtendedFeature['geometry']>, MapFeature['properties']>;
type D3FeatureCollection = ExtendedFeatureCollection<D3MapFeature>;

const FULL_WIDTH = 760;
const FULL_HEIGHT = 430;
const AUTO_ROTATE_MS = 5000;

type AtlasGroupDef = { key: string; label: string; provinces: string[] };

const ATLAS_GROUPS: AtlasGroupDef[] = [
  { key: 'sumatera', label: 'Sumatera', provinces: ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Jambi', 'Bengkulu', 'Sumatera Selatan', 'Lampung', 'Kepulauan Bangka Belitung', 'Kepulauan Riau'] },
  { key: 'jawa', label: 'Jawa', provinces: ['Banten', 'Dki Jakarta', 'Jawa Barat', 'Jawa Tengah', 'Daerah Istimewa Yogyakarta', 'Jawa Timur'] },
  { key: 'kalimantan', label: 'Kalimantan', provinces: ['Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara'] },
  { key: 'sulawesi', label: 'Sulawesi', provinces: ['Gorontalo', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara'] },
  { key: 'bali-nusa-tenggara', label: 'Bali & Nusa Tenggara', provinces: ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur'] },
  { key: 'maluku', label: 'Maluku', provinces: ['Maluku', 'Maluku Utara'] },
  { key: 'papua', label: 'Papua', provinces: ['Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan'] },
];

function normalizeProvinceKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/^(kabupaten administrasi|kota administrasi|kabupaten|kota|provinsi|propinsi)\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const globalProjection = geoMercator().fitSize([FULL_WIDTH, FULL_HEIGHT], mapData as unknown as D3FeatureCollection);
const globalPathGen = geoPath(globalProjection);

const allPathsByKey = new Map<string, { d: string; provinceKey: string }>();
mapFeatures.forEach((feature) => {
  const d = globalPathGen(feature as unknown as D3MapFeature);
  if (d) {
    allPathsByKey.set(feature.properties.map_key, {
      d,
      provinceKey: normalizeProvinceKey(feature.properties.province),
    });
  }
});

type PrecomputedSlide = {
  key: string;
  label: string;
  viewBox: string;
  paths: { mapKey: string; d: string; provinceKey: string }[];
};

const precomputedSlides: PrecomputedSlide[] = ATLAS_GROUPS.map((group) => {
  const groupSet = new Set(group.provinces.map((p) => normalizeProvinceKey(p)));
  const paths: PrecomputedSlide['paths'] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  mapFeatures.forEach((feature) => {
    const pk = normalizeProvinceKey(feature.properties.province);
    if (!groupSet.has(pk)) return;
    const entry = allPathsByKey.get(feature.properties.map_key);
    if (!entry) return;

    paths.push({ mapKey: feature.properties.map_key, d: entry.d, provinceKey: entry.provinceKey });

    const nums = entry.d.match(/-?[\d.]+/g);
    if (!nums) return;
    for (let i = 0; i < nums.length - 1; i += 2) {
      const x = parseFloat(nums[i]);
      const y = parseFloat(nums[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || y < 0 || x > FULL_WIDTH || y > FULL_HEIGHT) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });

  const pad = 20;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(FULL_WIDTH, maxX + pad);
  maxY = Math.min(FULL_HEIGHT, maxY + pad);

  const vbW = maxX - minX;
  const vbH = maxY - minY;
  const viewBox = paths.length > 0 && vbW > 1 && vbH > 1
    ? `${minX} ${minY} ${vbW} ${vbH}`
    : `0 0 ${FULL_WIDTH} ${FULL_HEIGHT}`;

  return { key: group.key, label: group.label, viewBox, paths };
});



type ProvinceMetric = { count: number; highRiskCount: number; label: string };

function provinceFill(metric?: ProvinceMetric) {
  if (!metric || metric.count === 0) return '#ded8bd';
  const ratio = metric.highRiskCount / Math.max(1, metric.count);
  if (ratio >= 0.5) return '#E05A4F';
  if (ratio >= 0.2) return '#D8A42F';
  return '#c4b888';
}

function aggregateProvinceMetrics(items: ArchiveRegionMapItem[]) {
  const metrics = new Map<string, ProvinceMetric>();
  items.forEach((item) => {
    const provinceKey = normalizeProvinceKey(item.province ?? '');
    if (!provinceKey) return;
    const label = item.province?.trim() || item.label;
    const current = metrics.get(provinceKey) ?? { count: 0, highRiskCount: 0, label };
    current.count += item.count;
    current.highRiskCount += item.high_risk_count;
    current.label = label;
    metrics.set(provinceKey, current);
  });
  return metrics;
}

type Props = {
  analytics: ArchiveAnalyticsResponse | null;
  onNavigate?: (href: string) => void;
};

export function OverviewAtlasCarousel({ analytics }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = precomputedSlides.length;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const provinceMetrics = aggregateProvinceMetrics(analytics?.region_map ?? []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, AUTO_ROTATE_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slideCount]);

  const goTo = (index: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const bounded = ((index % slideCount) + slideCount) % slideCount;
    setActiveIndex(bounded);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, AUTO_ROTATE_MS);
  };

  const slide = precomputedSlides[activeIndex];

  return (
    <section style={styles.card} aria-label="Peta wilayah Indonesia">
      <div style={styles.header}>
        <div style={styles.labelRow}>
          <MapTrifold size={14} weight="fill" style={{ opacity: 0.6 }} />
          <span style={styles.regionLabel}>{slide.label}</span>
        </div>
        <div style={styles.controls}>
          <button type="button" aria-label="Previous" onClick={() => goTo(activeIndex - 1)} style={styles.controlButton}>
            <CaretLeft size={14} weight="bold" />
          </button>
          <span style={styles.counter}>{activeIndex + 1}/{slideCount}</span>
          <button type="button" aria-label="Next" onClick={() => goTo(activeIndex + 1)} style={styles.controlButton}>
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>

      <svg
        viewBox={slide.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={styles.svg}
        role="img"
        aria-label={`Peta ${slide.label}`}
      >
        {slide.paths.map((p) => {
          const metric = provinceMetrics.get(p.provinceKey);
          return (
            <path
              key={p.mapKey}
              d={p.d}
              fill={provinceFill(metric)}
              stroke={metric?.count ? 'rgba(17,16,15,.55)' : 'rgba(32,31,30,.24)'}
              strokeWidth={metric?.count ? 1.0 : 0.5}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      <div style={styles.dots}>
        {precomputedSlides.map((s, index) => (
          <button key={s.key} type="button" aria-label={s.label} onClick={() => goTo(index)} style={index === activeIndex ? styles.dotActive : styles.dot} />
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'grid',
    gap: 8,
    padding: 12,
    borderRadius: 20,
    background: 'var(--lp-panel)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--lp-text)',
  },
  regionLabel: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '-.02em',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  counter: {
    fontSize: 11,
    color: 'var(--lp-muted)',
    fontVariantNumeric: 'tabular-nums',
  },
  controlButton: {
    width: 26,
    height: 26,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'rgba(255,255,255,.04)',
    color: 'var(--lp-text)',
    cursor: 'pointer',
  },
  svg: {
    width: '100%',
    aspectRatio: '16 / 9',
    display: 'block',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#f7f4e7',
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    border: 'none',
    background: 'rgba(255,255,255,.2)',
    padding: 0,
    cursor: 'pointer',
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 999,
    border: 'none',
    background: 'var(--lp-cream)',
    padding: 0,
    cursor: 'pointer',
  },
};
