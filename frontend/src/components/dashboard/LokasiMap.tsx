import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { ExtendedFeature, ExtendedFeatureCollection } from 'd3-geo';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl';
import type { ArchiveAnalyticsResponse, ArchiveConcentrationItem, ArchiveRegionMapItem } from '../../types/api';
import { mapData, mapFeatures as features, regionCenterByKey } from './regionGeometry';
import type { MapFeature } from './regionGeometry';
import nusantaraSvgRaw from '../../assets/maps/nusantara-quest-indonesia.svg?raw';
import { KABUPATEN_TO_PROVINCE } from './kabupatenToProvince';
import { pathIdToRegionKey, PRIMARY_NAME_BY_CODE } from './nusantaraProvinceCodes';

type InteractiveMapFeature = MapFeature & {
  properties: MapFeature['properties'] & {
    risk_fill: string;
    risk_opacity: number;
    risk_stroke: string;
    risk_line_width: number;
    risk_count: number;
    has_metric: boolean;
    is_focus: boolean;
  };
};

type InteractiveFeatureCollection = {
  type: 'FeatureCollection';
  features: InteractiveMapFeature[];
};

type DistributionPointFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    map_key: string;
    label: string;
    count: number;
    high_risk_count: number;
    high_risk_percent: number;
    average_risk_score: number;
    bubble_radius: number;
    bubble_color: string;
    bubble_opacity: number;
    bubble_stroke: string;
    bubble_stroke_width: number;
    is_focus: boolean;
  };
};

type DistributionPointCollection = {
  type: 'FeatureCollection';
  features: DistributionPointFeature[];
};

type DistributionStats = {
  mappedRegions: number;
  totalPackages: number;
  highRiskCount: number;
  peakLabel: string | null;
  peakCount: number;
};

type D3MapFeature = ExtendedFeature<NonNullable<ExtendedFeature['geometry']>, MapFeature['properties']>;
type D3FeatureCollection = ExtendedFeatureCollection<D3MapFeature>;

type Props = {
  analytics: ArchiveAnalyticsResponse | null;
  selectedRegionKey: string;
  loading?: boolean;
  onSelectRegion: (regionKey: string) => void;
};

type RegionMetric = {
  label: string;
  mapKey: string;
  count: number;
  highRiskCount: number;
  averageRiskScore: number;
  percent: number;
  regionType: string | null;
  source: string | null;
  note: string | null;
};

type MapMode = 'interactive' | 'svg';
type MapStatus = 'loading' | 'ready' | 'fallback';

const width = 760;
const height = 430;
const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const MAP_LOAD_TIMEOUT_MS = 6_500;
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [[94.2, -12.4], [141.2, 7.8]];
const REGION_SOURCE_ID = 'lpse-risk-regions';
const REGION_FILL_LAYER_ID = 'lpse-risk-regions-fill';
const REGION_LINE_LAYER_ID = 'lpse-risk-regions-line';
const DISTRIBUTION_SOURCE_ID = 'lpse-risk-distribution';
const DISTRIBUTION_BUBBLE_LAYER_ID = 'lpse-risk-distribution-bubbles';

export function LokasiMap({ analytics, selectedRegionKey, loading = false, onSelectRegion }: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>(() => (canUseInteractiveMap() ? 'interactive' : 'svg'));
  const [mapStatus, setMapStatus] = useState<MapStatus>(() => (canUseInteractiveMap() ? 'loading' : 'fallback'));
  const [canRetryInteractive, setCanRetryInteractive] = useState(() => canUseInteractiveMap());
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLoadedRef = useRef(false);
  const onSelectRegionRef = useRef(onSelectRegion);
  const selectedRegionKeyRef = useRef(selectedRegionKey);
  const metricByKeyRef = useRef<Map<string, RegionMetric>>(new Map());
  const hoverKeyRef = useRef<string | null>(null);
  const interactiveMapDataRef = useRef<InteractiveFeatureCollection | null>(null);
  const distributionDataRef = useRef<DistributionPointCollection | null>(null);
  const mapHandlersBoundRef = useRef(false);

  const metrics = useMemo(() => buildMetrics(analytics?.region_map?.length ? analytics.region_map : analytics?.regional_concentration ?? []), [analytics]);
  const metricByKey = useMemo(() => new Map(metrics.map((metric) => [metric.mapKey, metric])), [metrics]);
  const maxCount = Math.max(1, ...metrics.map((metric) => metric.count));
  const selectedMetric = metrics.find((metric) => metric.mapKey === selectedRegionKey) ?? null;
  const hoverMetric = hoverKey ? metricByKey.get(hoverKey) ?? null : null;
  const detailMetric = hoverMetric ?? selectedMetric;
  const interactiveMapData = useMemo(
    () => buildInteractiveMapData(metricByKey, maxCount, '', null),
    [maxCount, metricByKey],
  );
  const distributionData = useMemo(
    () => buildDistributionData(metricByKey, maxCount, '', null),
    [maxCount, metricByKey],
  );
  const svgDistributionData = useMemo(
    () => buildDistributionData(metricByKey, maxCount, selectedRegionKey, hoverKey),
    [hoverKey, maxCount, metricByKey, selectedRegionKey],
  );
  const distributionStats = useMemo(() => buildDistributionStats(distributionData), [distributionData]);

  onSelectRegionRef.current = onSelectRegion;
  metricByKeyRef.current = metricByKey;
  hoverKeyRef.current = hoverKey;
  interactiveMapDataRef.current = interactiveMapData;
  distributionDataRef.current = distributionData;

  useEffect(() => {
    if (mapMode !== 'interactive') return undefined;
    if (!canUseInteractiveMap()) {
      setCanRetryInteractive(false);
      setMapStatus('fallback');
      setMapMode('svg');
      return undefined;
    }

    const container = mapContainerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let loadTimeout: number | undefined;
    setCanRetryInteractive(true);
    setMapStatus('loading');

    void import('maplibre-gl')
      .then((maplibregl) => {
        if (cancelled || !mapContainerRef.current) return;

        try {
          const map = new maplibregl.Map({
            attributionControl: false,
            center: [118, -2.8],
            container: mapContainerRef.current,
            cooperativeGestures: false,
            fadeDuration: 0,
            maxBounds: [[91, -16], [145, 11]],
            pitch: 18,
            style: OPENFREEMAP_STYLE_URL,
            zoom: 3.15,
          });

          map.scrollZoom.enable();
          mapRef.current = map;
          mapLoadedRef.current = false;
          mapHandlersBoundRef.current = false;
          map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
          map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'OpenFreeMap · OpenStreetMap' }), 'bottom-right');

          const handleMapError = () => {
            if (mapLoadedRef.current || cancelled) return;
            if (loadTimeout !== undefined) window.clearTimeout(loadTimeout);
            setMapStatus('fallback');
            setMapMode('svg');
          };

          const handleMapReady = () => {
            if (cancelled) return;
            if (loadTimeout !== undefined) window.clearTimeout(loadTimeout);
            try {
              mapLoadedRef.current = true;
              ensureRiskOverlay(map, interactiveMapDataRef.current ?? interactiveMapData, distributionDataRef.current ?? distributionData, {
                handlersBound: mapHandlersBoundRef,
                hoverKey: hoverKeyRef,
                metricByKey: metricByKeyRef,
                onSelectRegion: onSelectRegionRef,
                selectedRegionKey: selectedRegionKeyRef,
                setHoverKey,
              });
              map.fitBounds(INDONESIA_BOUNDS, { duration: 0, padding: { top: 30, bottom: 28, left: 28, right: 28 } });
              map.resize();
              setMapStatus('ready');
            } catch {
              setMapStatus('fallback');
              setMapMode('svg');
            }
          };

          map.on('error', handleMapError);
          map.once('load', handleMapReady);
          loadTimeout = window.setTimeout(() => {
            if (cancelled || mapLoadedRef.current) return;
            setMapStatus('fallback');
            setMapMode('svg');
          }, MAP_LOAD_TIMEOUT_MS);
        } catch {
          if (!cancelled) {
            setMapStatus('fallback');
            setMapMode('svg');
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapStatus('fallback');
          setMapMode('svg');
        }
      });

    return () => {
      cancelled = true;
      if (loadTimeout !== undefined) window.clearTimeout(loadTimeout);
      mapLoadedRef.current = false;
      mapHandlersBoundRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapMode]);

  useEffect(() => {
    if (mapMode !== 'interactive' || mapStatus !== 'ready') return;
    const map = mapRef.current;
    if (!map) return;
    try {
      const regionSource = map.getSource(REGION_SOURCE_ID) as GeoJSONSource | undefined;
      const distributionSource = map.getSource(DISTRIBUTION_SOURCE_ID) as GeoJSONSource | undefined;
      if (!regionSource || !distributionSource || !map.getLayer(DISTRIBUTION_BUBBLE_LAYER_ID)) {
        ensureRiskOverlay(map, interactiveMapData, distributionData, {
          handlersBound: mapHandlersBoundRef,
          hoverKey: hoverKeyRef,
          metricByKey: metricByKeyRef,
          onSelectRegion: onSelectRegionRef,
          selectedRegionKey: selectedRegionKeyRef,
          setHoverKey,
        });
        return;
      }
      regionSource.setData(interactiveMapData as Parameters<GeoJSONSource['setData']>[0]);
      distributionSource.setData(distributionData as Parameters<GeoJSONSource['setData']>[0]);
      reapplyMapFeatureState(map, selectedRegionKeyRef.current, hoverKeyRef.current);
    } catch {
      setMapStatus('fallback');
      setMapMode('svg');
    }
  }, [distributionData, interactiveMapData, mapMode, mapStatus]);

  useEffect(() => {
    if (mapMode !== 'interactive' || mapStatus !== 'ready') {
      selectedRegionKeyRef.current = selectedRegionKey;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    applySelectedRegionState(map, selectedRegionKeyRef.current, selectedRegionKey);
    selectedRegionKeyRef.current = selectedRegionKey;
  }, [mapMode, mapStatus, selectedRegionKey]);

  const useInteractiveMap = () => {
    if (!canUseInteractiveMap()) {
      setCanRetryInteractive(false);
      setMapStatus('fallback');
      setMapMode('svg');
      return;
    }
    setCanRetryInteractive(true);
    setMapStatus('loading');
    setMapMode('interactive');
  };

  const useSvgFallback = () => {
    setMapStatus('fallback');
    setMapMode('svg');
  };

  return (
    <section className="card lokasi-map" aria-label="Lokasi Map Distribusi">
      <div className="lokasi-map__header">
        <div>
          <span className="lokasi-map__eyebrow">OpenFreeMap primary · SVG backup</span>
          <h2>Open-source Indonesia risk map</h2>
        </div>
        <div className="lokasi-map__actions">
          <span className={`lokasi-map__mode lokasi-map__mode--${mapMode === 'interactive' && mapStatus === 'ready' ? 'live' : 'fallback'}`}>
            {mapMode === 'interactive' && mapStatus === 'ready' ? 'Open map live' : mapMode === 'interactive' ? 'Loading map' : 'SVG backup'}
          </span>
          {mapMode === 'interactive' ? (
            <button className="btn-secondary" type="button" onClick={useSvgFallback}>Use SVG backup</button>
          ) : canRetryInteractive ? (
            <button className="btn-secondary" type="button" onClick={useInteractiveMap}>Try OpenFreeMap</button>
          ) : null}
          <button className="btn-secondary" type="button" disabled={!selectedRegionKey} onClick={() => onSelectRegion('')}>Clear region filter</button>
        </div>
      </div>
      {loading && <p className="muted">Memuat ringkasan lokasi lokal...</p>}
      <div className="lokasi-map__grid">
        <div className={`lokasi-map__frame lokasi-map__frame--${mapMode}`}>
          {mapMode === 'interactive' ? (
            <>
              <div ref={mapContainerRef} className="lokasi-map__canvas" role="img" aria-label="Open-source Indonesia MapLibre map with local risk overlay" />
              {mapStatus !== 'ready' && (
                <div className="lokasi-map__loading" aria-live="polite">
                  <strong>Loading OpenFreeMap</strong>
                  <span>Jika basemap gagal, SVG lokal otomatis aktif.</span>
                </div>
              )}
            </>
          ) : (
            <SvgRiskMap
              distributionData={svgDistributionData}
              hoverKey={hoverKey}
              maxCount={maxCount}
              metricByKey={metricByKey}
              onHover={setHoverKey}
              onSelectRegion={onSelectRegion}
              selectedRegionKey={selectedRegionKey}
            />
          )}
          <DistributionSpreadCard loading={loading} stats={distributionStats} />
          <div className="lokasi-map__legend" aria-label="Region legend">
            <span><i style={{ background: '#d7d1b0' }} /> Low</span>
            <span><i style={{ background: '#a9a17f' }} /> Medium</span>
            <span><i style={{ background: '#5f5a55' }} /> High concentration</span>
            <span><i className="lokasi-map__legend-bubble" /> Bubble size = package count</span>
          </div>
        </div>
        <aside className="lokasi-map__detail" aria-live="polite">
          {detailMetric ? (
            <>
              <h3>{detailMetric.label}</h3>
              <dl>
                <Metric label="Total packages" value={detailMetric.count.toLocaleString('id-ID')} />
                <Metric label="High-risk count" value={detailMetric.highRiskCount.toLocaleString('id-ID')} />
                <Metric label="Average score" value={detailMetric.averageRiskScore.toLocaleString('id-ID', { maximumFractionDigits: 3 })} />
                <Metric label="Archive share" value={`${detailMetric.percent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} />
              </dl>
            </>
          ) : (
            <p>Klik wilayah berwarna untuk menerapkan filter `region_key`. Klik area kosong pada peta untuk menghapus filter.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

const NUSANTARA_VIEWBOX = '0 0 818.1 353.5';
const NUSANTARA_W = 818.1;
const NUSANTARA_H = 353.5;

const _NUSANTARA_NON_GEO_IDS = new Set(['wrapper', 'map', 'map-group', 'svg-background', 'credit-text-svg', 'credit-tspan-svg']);
const _NUSANTARA_NON_GEO_PREFIXES = ['pattern', 'texture', 'stripes', 'hatch', 'noise', 'defs'];

interface NusantaraMapPath {
  id: string;
  d: string;
  regionKey: string;
  provinceCode: string;
  provinceKey: string;
}

function _parseNusantaraMapPaths(): NusantaraMapPath[] {
  const results: NusantaraMapPath[] = [];
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
      if (_NUSANTARA_NON_GEO_IDS.has(id)) continue;
      if (_NUSANTARA_NON_GEO_PREFIXES.some((p) => id.startsWith(p))) continue;
      seen.add(id);
      const provinceCode = KABUPATEN_TO_PROVINCE[id] ?? '';
      const provinceKey = provinceCode ? (PRIMARY_NAME_BY_CODE[provinceCode] ?? '') : '';
      results.push({ id, d, regionKey: pathIdToRegionKey(id), provinceCode, provinceKey });
    }
  }
  return results;
}

const NUSANTARA_PATHS = _parseNusantaraMapPaths();

/**
 * Native SVG-space center for each region path. The Nusantara SVG is a stylized
 * illustration whose path coordinates do NOT follow Mercator projection, so we
 * cannot project geo lon/lat onto this SVG. Instead, walk every path's `d`
 * attribute and keep the bounding-box center in SVG units. Bubbles then sit
 * exactly on the corresponding kabupaten/kota shape.
 */
const SVG_REGION_CENTERS = (() => {
  const centers = new Map<string, [number, number]>();
  NUSANTARA_PATHS.forEach((path) => {
    const bbox = computeSvgPathBBox(path.d);
    if (!bbox) return;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    centers.set(path.regionKey, [cx, cy]);
  });
  return centers;
})();

type SvgPathBBox = { minX: number; minY: number; maxX: number; maxY: number };

function computeSvgPathBBox(d: string): SvgPathBBox | null {
  // Lightweight bbox extractor: tokenizes the `d` attribute, walks commands
  // honouring relative vs absolute pairs, and tracks min/max for every
  // resolved coordinate. Sufficient for the Nusantara SVG which uses plain
  // M/m/L/l/H/h/V/v/C/c/S/s/Q/q/T/t/A/a/Z commands.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return null;
  let i = 0;
  let cmd = '';
  const num = (): number => Number.parseFloat(tokens[i++]);
  const isCommand = (t: string) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(t);
  const update = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'M' || cmd === 'm') {
        const x = num(), y = num();
        if (cmd === 'M') { cx = x; cy = y; } else { cx += x; cy += y; }
        startX = cx; startY = cy;
        update(cx, cy);
        // Subsequent pairs after M/m act as L/l
        cmd = cmd === 'M' ? 'L' : 'l';
        continue;
      }
      if (cmd === 'Z' || cmd === 'z') { cx = startX; cy = startY; continue; }
    }
    switch (cmd) {
      case 'L': cx = num(); cy = num(); update(cx, cy); break;
      case 'l': cx += num(); cy += num(); update(cx, cy); break;
      case 'H': cx = num(); update(cx, cy); break;
      case 'h': cx += num(); update(cx, cy); break;
      case 'V': cy = num(); update(cx, cy); break;
      case 'v': cy += num(); update(cx, cy); break;
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        update(x1, y1); update(x2, y2); update(x, y);
        cx = x; cy = y; break;
      }
      case 'c': {
        const x1 = cx + num(), y1 = cy + num();
        const x2 = cx + num(), y2 = cy + num();
        const x  = cx + num(), y  = cy + num();
        update(x1, y1); update(x2, y2); update(x, y);
        cx = x; cy = y; break;
      }
      case 'S': case 'Q': {
        const x1 = num(), y1 = num(), x = num(), y = num();
        update(x1, y1); update(x, y); cx = x; cy = y; break;
      }
      case 's': case 'q': {
        const x1 = cx + num(), y1 = cy + num();
        const x  = cx + num(), y  = cy + num();
        update(x1, y1); update(x, y); cx = x; cy = y; break;
      }
      case 'T': { const x = num(), y = num(); update(x, y); cx = x; cy = y; break; }
      case 't': { const x = cx + num(), y = cy + num(); update(x, y); cx = x; cy = y; break; }
      case 'A': {
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y
        num(); num(); num(); num(); num();
        const x = num(), y = num();
        update(x, y); cx = x; cy = y; break;
      }
      case 'a': {
        num(); num(); num(); num(); num();
        const x = cx + num(), y = cy + num();
        update(x, y); cx = x; cy = y; break;
      }
      default:
        // Unknown command — skip remaining number tokens until next command
        if (i < tokens.length && !isCommand(tokens[i])) i++;
        break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

const _indonesiaBoundsFeature = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[95, -11], [141.5, -11], [141.5, 6], [95, 6], [95, -11]]],
  },
};
const svgProjection = geoMercator().fitSize(
  [NUSANTARA_W, NUSANTARA_H],
  _indonesiaBoundsFeature as unknown as D3FeatureCollection,
);

function SvgRiskMap({ distributionData, hoverKey, maxCount, metricByKey, onHover, onSelectRegion, selectedRegionKey }: {
  distributionData: DistributionPointCollection;
  hoverKey: string | null;
  maxCount: number;
  metricByKey: Map<string, RegionMetric>;
  onHover: (regionKey: string | null) => void;
  onSelectRegion: (regionKey: string) => void;
  selectedRegionKey: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ─── Zoom & pan state (SVG viewBox transform, no library) ────────────────
  const INITIAL_VIEW = useMemo(
    () => ({ x: 0, y: 0, w: NUSANTARA_W, h: NUSANTARA_H }),
    [],
  );
  const [view, setView] = useState(INITIAL_VIEW);
  const dragRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const MIN_ZOOM = 1;        // 1x = full Indonesia in view (initial)
  const MAX_ZOOM = 12;       // 12x = ~kabupaten level
  const currentZoom = NUSANTARA_W / view.w;

  /** Convert client (px) coords to SVG-user coords using the current viewBox. */
  const clientToSvg = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return [view.x + px * view.w, view.y + py * view.h];
  };

  /** Apply a multiplicative zoom centered on a given client position. */
  const applyZoom = (factor: number, clientX?: number, clientY?: number) => {
    setView((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (NUSANTARA_W / prev.w) * factor));
      const nextW = NUSANTARA_W / nextZoom;
      const nextH = NUSANTARA_H / nextZoom;
      // Default focal point = center of current view
      const svg = svgRef.current;
      let focalX = prev.x + prev.w / 2;
      let focalY = prev.y + prev.h / 2;
      if (svg && clientX !== undefined && clientY !== undefined) {
        const rect = svg.getBoundingClientRect();
        const px = (clientX - rect.left) / rect.width;
        const py = (clientY - rect.top) / rect.height;
        focalX = prev.x + px * prev.w;
        focalY = prev.y + py * prev.h;
      }
      // Keep focal point fixed on screen
      const px = (focalX - prev.x) / prev.w;
      const py = (focalY - prev.y) / prev.h;
      let nextX = focalX - px * nextW;
      let nextY = focalY - py * nextH;
      // Clamp pan so the view never escapes the original frame
      nextX = Math.max(0, Math.min(NUSANTARA_W - nextW, nextX));
      nextY = Math.max(0, Math.min(NUSANTARA_H - nextH, nextY));
      return { x: nextX, y: nextY, w: nextW, h: nextH };
    });
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    applyZoom(factor, event.clientX, event.clientY);
  };

  const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y };
    setIsPanning(true);
  };

  const handleMouseMoveSvg = (event: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * view.w;
    const dy = ((event.clientY - drag.startY) / rect.height) * view.h;
    setView((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(NUSANTARA_W - prev.w, drag.viewX - dx)),
      y: Math.max(0, Math.min(NUSANTARA_H - prev.h, drag.viewY - dy)),
    }));
  };

  const stopPan = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsPanning(false);
  };

  const resetView = () => setView(INITIAL_VIEW);

  // Click is suppressed if user just panned more than a few pixels.
  const clickGuardRef = useRef<{ x: number; y: number } | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  // Event delegation: single handler on SVG container instead of 518 × 6 handlers
  const handlePointerEvent = (event: React.MouseEvent<SVGSVGElement> | React.FocusEvent<SVGSVGElement> | React.KeyboardEvent<SVGSVGElement>) => {
    const target = (event.target as Element).closest('[data-region-key]');
    const regionKey = target?.getAttribute('data-region-key') ?? null;

    switch (event.type) {
      case 'mouseover':
        onHover(regionKey);
        break;
      case 'mouseout': {
        const related = (event as React.MouseEvent).relatedTarget as Element | null;
        if (!related || !svgRef.current?.contains(related)) onHover(null);
        else {
          const nextKey = related.closest('[data-region-key]')?.getAttribute('data-region-key') ?? null;
          onHover(nextKey);
        }
        break;
      }
      case 'focusin':
        onHover(regionKey);
        break;
      case 'focusout':
        onHover(null);
        break;
      case 'click': {
        // Suppress click that resulted from a pan gesture.
        const start = clickGuardRef.current;
        const me = event as React.MouseEvent;
        clickGuardRef.current = null;
        if (start && Math.hypot(me.clientX - start.x, me.clientY - start.y) > 4) break;
        if (!regionKey) {
          onHover(null);
          if (selectedRegionKey) onSelectRegion('');
        } else {
          const metric = metricByKey.get(regionKey);
          if (metric) onSelectRegion(selectedRegionKey === regionKey ? '' : regionKey);
          else { onHover(null); if (selectedRegionKey) onSelectRegion(''); }
        }
        break;
      }
      case 'keydown': {
        const ke = event as React.KeyboardEvent;
        if (regionKey && (ke.key === 'Enter' || ke.key === ' ')) {
          ke.preventDefault();
          const metric = metricByKey.get(regionKey);
          if (metric) onSelectRegion(selectedRegionKey === regionKey ? '' : regionKey);
        }
        break;
      }
    }
  };

  // Avoid TS unused warning — keep helper exposed for future drag-to-zoom use.
  void clientToSvg;

  return (
    <div className="lokasi-map__svg-wrap">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label="Local Indonesia kabupaten kota SVG backup map"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={(event) => {
          clickGuardRef.current = { x: event.clientX, y: event.clientY };
          handleMouseDown(event);
        }}
        onMouseMove={handleMouseMoveSvg}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        onMouseOver={handlePointerEvent}
        onMouseOut={handlePointerEvent}
        onFocusCapture={handlePointerEvent}
        onBlurCapture={handlePointerEvent}
        onClick={handlePointerEvent}
        onKeyDown={handlePointerEvent}
      >
      <rect className="lokasi-map__background" width={NUSANTARA_W} height={NUSANTARA_H} fill="#f7f4e7" />
      {NUSANTARA_PATHS.map((path) => {
        const key = resolveMetricKey(path.regionKey, metricByKey);
        const metric = metricByKey.get(key);
        const active = selectedRegionKey === key;
        const hovered = hoverKey === key;
        return (
          <path
            key={path.id}
            d={path.d}
            tabIndex={metric ? 0 : -1}
            role={metric ? 'button' : undefined}
            aria-label={`${path.id.replace(/_/g, ' ')}${metric ? ` ${metric.count} paket` : ' belum ada data'}`}
            data-region-key={key}
            data-province-code={path.provinceCode}
            className="lokasi-map__path"
            style={{
              fill: metric ? choropleth(metric.count, maxCount) : '#ded8bd',
              stroke: active || hovered ? '#11100F' : 'rgba(32,31,30,.24)',
              strokeWidth: active || hovered ? 2.1 : 0.75,
              cursor: metric ? 'pointer' : 'default',
              opacity: metric ? 0.96 : 0.42,
            }}
          />
        );
      })}
      <g className="lokasi-map__bubbles" aria-label="Dataset distribution bubbles">
        {distributionData.features.map((point) => {
          const key = point.properties.map_key;
          const svgCenter = resolveSvgCenter(key);
          if (!svgCenter) return null;
          const [x, y] = svgCenter;
          return (
            <circle
              key={`bubble-${key}`}
              aria-label={`${point.properties.label} distribution ${point.properties.count} paket`}
              className="lokasi-map__bubble"
              data-region-key={key}
              role="button"
              tabIndex={0}
              cx={x}
              cy={y}
              r={point.properties.bubble_radius}
              fill={point.properties.bubble_color}
              fillOpacity={point.properties.bubble_opacity}
              stroke={point.properties.bubble_stroke}
              strokeWidth={point.properties.bubble_stroke_width}
            />
          );
        })}
      </g>
    </svg>
      <div className="lokasi-map__zoom" role="group" aria-label="Zoom map">
        <button
          type="button"
          className="lokasi-map__zoom-btn"
          aria-label="Zoom in"
          disabled={currentZoom >= MAX_ZOOM - 1e-3}
          onClick={() => applyZoom(1.4)}
        >+</button>
        <button
          type="button"
          className="lokasi-map__zoom-btn"
          aria-label="Zoom out"
          disabled={currentZoom <= MIN_ZOOM + 1e-3}
          onClick={() => applyZoom(1 / 1.4)}
        >−</button>
        <button
          type="button"
          className="lokasi-map__zoom-btn lokasi-map__zoom-reset"
          aria-label="Reset zoom"
          disabled={currentZoom <= MIN_ZOOM + 1e-3}
          onClick={resetView}
        >⤺</button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

type MapInteractionRefs = {
  handlersBound: MutableRefObject<boolean>;
  hoverKey: MutableRefObject<string | null>;
  metricByKey: MutableRefObject<Map<string, RegionMetric>>;
  onSelectRegion: MutableRefObject<(regionKey: string) => void>;
  selectedRegionKey: MutableRefObject<string>;
  setHoverKey: (regionKey: string | null) => void;
};

function ensureRiskOverlay(map: MapLibreMap, data: InteractiveFeatureCollection, distributionData: DistributionPointCollection, interaction: MapInteractionRefs) {
  if (!map.getSource(REGION_SOURCE_ID)) {
    map.addSource(REGION_SOURCE_ID, {
      type: 'geojson',
      data: data as Parameters<GeoJSONSource['setData']>[0],
      promoteId: 'map_key',
    });
  }

  if (!map.getSource(DISTRIBUTION_SOURCE_ID)) {
    map.addSource(DISTRIBUTION_SOURCE_ID, {
      type: 'geojson',
      data: distributionData as Parameters<GeoJSONSource['setData']>[0],
      promoteId: 'map_key',
    });
  }

  if (!map.getLayer(REGION_FILL_LAYER_ID)) {
    map.addLayer({
      id: REGION_FILL_LAYER_ID,
      type: 'fill',
      source: REGION_SOURCE_ID,
      paint: {
        'fill-color': ['coalesce', ['get', 'risk_fill'], '#d7d1b0'],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.72,
          ['boolean', ['feature-state', 'hover'], false], 0.72,
          ['coalesce', ['get', 'risk_opacity'], 0.32],
        ],
      },
    });
  }

  if (!map.getLayer(REGION_LINE_LAYER_ID)) {
    map.addLayer({
      id: REGION_LINE_LAYER_ID,
      type: 'line',
      source: REGION_SOURCE_ID,
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#f7f4e7',
          ['boolean', ['feature-state', 'hover'], false], '#f7f4e7',
          ['coalesce', ['get', 'risk_stroke'], 'rgba(247,244,231,0.32)'],
        ],
        'line-opacity': 0.95,
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.2,
          ['boolean', ['feature-state', 'hover'], false], 2.2,
          ['coalesce', ['get', 'risk_line_width'], 0.65],
        ],
      },
    });
  }

  if (!map.getLayer(DISTRIBUTION_BUBBLE_LAYER_ID)) {
    map.addLayer({
      id: DISTRIBUTION_BUBBLE_LAYER_ID,
      type: 'circle',
      source: DISTRIBUTION_SOURCE_ID,
      paint: {
        'circle-blur': 0.04,
        'circle-color': ['coalesce', ['get', 'bubble_color'], '#d7d1b0'],
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.92,
          ['boolean', ['feature-state', 'hover'], false], 0.92,
          ['coalesce', ['get', 'bubble_opacity'], 0.68],
        ],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], ['+', ['coalesce', ['get', 'bubble_radius'], 5], 3],
          ['boolean', ['feature-state', 'hover'], false], ['+', ['coalesce', ['get', 'bubble_radius'], 5], 3],
          ['coalesce', ['get', 'bubble_radius'], 5],
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#f7f4e7',
          ['boolean', ['feature-state', 'hover'], false], '#f7f4e7',
          ['coalesce', ['get', 'bubble_stroke'], '#f7f4e7'],
        ],
        'circle-stroke-opacity': 0.92,
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.4,
          ['boolean', ['feature-state', 'hover'], false], 2.4,
          ['coalesce', ['get', 'bubble_stroke_width'], 1],
        ],
      },
    });
  }

  if (interaction.handlersBound.current) return;
  interaction.handlersBound.current = true;

  [REGION_FILL_LAYER_ID, DISTRIBUTION_BUBBLE_LAYER_ID].forEach((layerId) => {
    map.on('mousemove', layerId, (event: MapLayerMouseEvent) => {
      const key = readMapFeatureKey(event);
      const metric = key ? interaction.metricByKey.current.get(key) : null;
      map.getCanvas().style.cursor = metric ? 'pointer' : 'default';
      setHoveredRegionState(map, interaction, metric ? key : null);
    });

    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
      setHoveredRegionState(map, interaction, null);
    });
  });

  map.on('click', (event: MapMouseEvent) => {
    const queryLayers = [DISTRIBUTION_BUBBLE_LAYER_ID, REGION_FILL_LAYER_ID].filter((layerId) => Boolean(map.getLayer(layerId)));
    const clickedFeature = queryLayers.length > 0
      ? map.queryRenderedFeatures(event.point, { layers: queryLayers })[0]
      : undefined;
    const key = readRenderedFeatureKey(clickedFeature);
    if (!key || !interaction.metricByKey.current.has(key)) {
      clearMapSelection(interaction, map);
      return;
    }
    selectMapRegion(interaction, map, interaction.selectedRegionKey.current === key ? '' : key);
  });

  reapplyMapFeatureState(map, interaction.selectedRegionKey.current, interaction.hoverKey.current);
}

function selectMapRegion(interaction: MapInteractionRefs, map: MapLibreMap, nextRegionKey: string) {
  applySelectedRegionState(map, interaction.selectedRegionKey.current, nextRegionKey);
  interaction.selectedRegionKey.current = nextRegionKey;
  interaction.onSelectRegion.current(nextRegionKey);
}

function clearMapSelection(interaction: MapInteractionRefs, map: MapLibreMap) {
  map.getCanvas().style.cursor = '';
  const hadSelection = Boolean(interaction.selectedRegionKey.current);
  setHoveredRegionState(map, interaction, null);
  applySelectedRegionState(map, interaction.selectedRegionKey.current, '');
  interaction.selectedRegionKey.current = '';
  if (hadSelection) interaction.onSelectRegion.current('');
}

function setHoveredRegionState(map: MapLibreMap, interaction: MapInteractionRefs, nextRegionKey: string | null) {
  const previousRegionKey = interaction.hoverKey.current;
  if (previousRegionKey === nextRegionKey) return;
  applyHoverRegionState(map, previousRegionKey, nextRegionKey);
  interaction.hoverKey.current = nextRegionKey;
  interaction.setHoverKey(nextRegionKey);
}

function applyHoverRegionState(map: MapLibreMap, previousRegionKey: string | null, nextRegionKey: string | null) {
  setMapFeatureState(map, previousRegionKey, { hover: false });
  setMapFeatureState(map, nextRegionKey, { hover: true });
}

function applySelectedRegionState(map: MapLibreMap, previousRegionKey: string, nextRegionKey: string) {
  if (previousRegionKey === nextRegionKey) return;
  setMapFeatureState(map, previousRegionKey, { selected: false });
  setMapFeatureState(map, nextRegionKey, { selected: true });
}

function reapplyMapFeatureState(map: MapLibreMap, selectedRegionKey: string, hoverRegionKey: string | null) {
  setMapFeatureState(map, selectedRegionKey, { selected: true });
  setMapFeatureState(map, hoverRegionKey, { hover: true });
}

function setMapFeatureState(map: MapLibreMap, regionKey: string | null, state: { hover?: boolean; selected?: boolean }) {
  if (!regionKey) return;
  [REGION_SOURCE_ID, DISTRIBUTION_SOURCE_ID].forEach((source) => {
    if (!map.getSource(source)) return;
    try {
      map.setFeatureState({ source, id: regionKey }, state);
    } catch {
      // The style/source can be transient during OpenFreeMap reloads; the next render/source sync reapplies state.
    }
  });
}

function DistributionSpreadCard({ loading, stats }: { loading: boolean; stats: DistributionStats }) {
  const mappedText = loading && stats.mappedRegions === 0 ? 'Loading' : `${stats.mappedRegions.toLocaleString('id-ID')} wilayah`;
  return (
    <div className="lokasi-map__spread-card" aria-label="Dataset risk distribution spread summary">
      <span>Dataset risk spread</span>
      <strong>{mappedText}</strong>
      <dl>
        <div>
          <dt>Paket</dt>
          <dd>{stats.totalPackages.toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>Risiko tinggi</dt>
          <dd>{stats.highRiskCount.toLocaleString('id-ID')}</dd>
        </div>
      </dl>
      <p>{stats.peakLabel ? `${stats.peakLabel} paling padat · ${stats.peakCount.toLocaleString('id-ID')} paket` : 'Menunggu region map dari analytics lokal.'}</p>
    </div>
  );
}

function buildInteractiveMapData(metricByKey: Map<string, RegionMetric>, maxCount: number, selectedRegionKey: string, hoverKey: string | null): InteractiveFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => {
      const key = feature.properties.map_key;
      const metric = metricByKey.get(key);
      const focused = selectedRegionKey === key || hoverKey === key;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          risk_fill: metric ? choropleth(metric.count, maxCount) : '#ded8bd',
          risk_opacity: metric ? (focused ? 0.72 : 0.5) : 0.16,
          risk_stroke: focused ? '#f7f4e7' : 'rgba(247,244,231,0.28)',
          risk_line_width: focused ? 2.2 : 0.72,
          risk_count: metric?.count ?? 0,
          has_metric: Boolean(metric),
          is_focus: focused,
        },
      };
    }),
  };
}

function buildDistributionData(metricByKey: Map<string, RegionMetric>, maxCount: number, selectedRegionKey: string, hoverKey: string | null): DistributionPointCollection {
  const distributionFeatures = Array.from(metricByKey.values())
    .map((metric) => {
      const key = metric.mapKey;
      const coordinates = regionCenterByKey.get(key);
      if (!coordinates) return null;

      const focused = selectedRegionKey === key || hoverKey === key;
      const highRiskPercent = metric.count > 0 ? (metric.highRiskCount / metric.count) * 100 : 0;
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates,
        },
        properties: {
          map_key: key,
          label: metric.label,
          count: metric.count,
          high_risk_count: metric.highRiskCount,
          high_risk_percent: highRiskPercent,
          average_risk_score: metric.averageRiskScore,
          bubble_radius: bubbleRadius(metric.count, maxCount, focused),
          bubble_color: bubbleColor(highRiskPercent, metric.averageRiskScore),
          bubble_opacity: focused ? 0.92 : 0.72,
          bubble_stroke: focused ? '#f7f4e7' : 'rgba(17,16,15,0.42)',
          bubble_stroke_width: focused ? 2.4 : 1.1,
          is_focus: focused,
        },
      } satisfies DistributionPointFeature;
    })
    .filter((feature): feature is DistributionPointFeature => feature !== null)
    .sort((a, b) => b.properties.bubble_radius - a.properties.bubble_radius);

  return { type: 'FeatureCollection', features: distributionFeatures };
}

function buildDistributionStats(distributionData: DistributionPointCollection): DistributionStats {
  const totalPackages = distributionData.features.reduce((total, item) => total + item.properties.count, 0);
  const highRiskCount = distributionData.features.reduce((total, item) => total + item.properties.high_risk_count, 0);
  const peak = distributionData.features.reduce<DistributionPointFeature | null>((current, item) => {
    if (!current || item.properties.count > current.properties.count) return item;
    return current;
  }, null);
  return {
    mappedRegions: distributionData.features.length,
    totalPackages,
    highRiskCount,
    peakLabel: peak?.properties.label ?? null,
    peakCount: peak?.properties.count ?? 0,
  };
}

function resolveMetricKey(regionKey: string, metricByKey: Map<string, RegionMetric>): string {
  if (metricByKey.has(regionKey)) return regionKey;
  const kabKey = `kabupaten-${regionKey}`;
  if (metricByKey.has(kabKey)) return kabKey;
  const kotaKey = `kota-${regionKey}`;
  if (metricByKey.has(kotaKey)) return kotaKey;
  return regionKey;
}

/**
 * Look up a region center in SVG coordinates. Analytics keys are like
 * "kabupaten-katingan" / "kota-medan", but SVG_REGION_CENTERS is keyed by the
 * SVG path's normalized region key (without prefix). Try a sequence of
 * fallbacks so every analytics row that has a matching SVG path gets a bubble.
 */
function resolveSvgCenter(analyticsKey: string): [number, number] | null {
  const direct = SVG_REGION_CENTERS.get(analyticsKey);
  if (direct) return direct;
  const stripped = analyticsKey.replace(/^(kabupaten|kota|administrasi|kab)-/, '');
  if (stripped !== analyticsKey) {
    const hit = SVG_REGION_CENTERS.get(stripped);
    if (hit) return hit;
  }
  // Try slug variant (replace spaces, drop non-alphanumeric)
  const slug = stripped
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  if (slug && slug !== stripped) {
    const hit = SVG_REGION_CENTERS.get(slug);
    if (hit) return hit;
  }
  return null;
}

function projectionPoint(coordinates: [number, number]) {
  return svgProjection(coordinates) ?? [0, 0];
}

function bubbleRadius(count: number, maxCount: number, focused: boolean) {
  const scaled = 4.5 + Math.sqrt(Math.max(0, count) / Math.max(1, maxCount)) * 18;
  return Math.round((focused ? scaled + 3 : scaled) * 10) / 10;
}

function bubbleColor(highRiskPercent: number, averageRiskScore: number) {
  // Lowered thresholds so the choropleth bubble layer actually shows the
  // tail of the distribution. The dataset average sits around 6% high-risk,
  // so the previous 35%/16% thresholds rendered every bubble green.
  if (highRiskPercent >= 18 || averageRiskScore >= 0.55) return '#E05A4F';
  if (highRiskPercent >= 8 || averageRiskScore >= 0.32) return '#D8A42F';
  return '#4FA66A';
}

function buildMetrics(items: Array<ArchiveRegionMapItem | ArchiveConcentrationItem>): RegionMetric[] {
  return items.map((item) => {
    if ('region_key' in item) {
      return {
        label: item.label,
        mapKey: item.map_key ?? item.region_key,
        count: item.count,
        highRiskCount: item.high_risk_count,
        averageRiskScore: item.average_risk_score,
        percent: item.percent,
        regionType: item.region_type,
        source: item.region_source,
        note: item.region_note,
      };
    }
    const label = item.region || item.label;
    return {
      label,
      mapKey: normalizeRegionKey(label, item.region_type),
      count: item.count,
      highRiskCount: item.high_risk_count,
      averageRiskScore: item.average_risk_score,
      percent: item.percent,
      regionType: item.region_type,
      source: item.region_source,
      note: item.region_note,
    };
  });
}

function normalizeRegionKey(value: string, regionType?: string | null) {
  const normalizedType = (regionType ?? '').toLocaleLowerCase('id-ID');
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/^(kabupaten administrasi|kota administrasi|kabupaten|kota|kab\.?|provinsi|propinsi)\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return 'unknown';
  if (normalizedType === 'kabupaten' || normalizedType === 'kota' || normalizedType === 'provinsi') return `${normalizedType}-${slug}`;
  return slug;
}

function choropleth(count: number, maxCount: number) {
  const ratio = Math.max(0, Math.min(1, count / maxCount));
  if (ratio > 0.66) return '#5f5a55';
  if (ratio > 0.33) return '#a9a17f';
  return '#d7d1b0';
}

function canUseInteractiveMap() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !('WebGLRenderingContext' in window)) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function readMapFeatureKey(event: MapLayerMouseEvent) {
  return readRenderedFeatureKey(event.features?.[0]);
}

function readRenderedFeatureKey(feature: { properties?: unknown } | undefined) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== 'object' || !('map_key' in properties)) return null;
  const mapKey = (properties as { map_key?: unknown }).map_key;
  return typeof mapKey === 'string' ? mapKey : null;
}
