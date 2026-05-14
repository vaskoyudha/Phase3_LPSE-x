import type { CSSProperties, ReactNode } from 'react';
import { ArrowDown, ArrowSquareOut, ArrowUp, Briefcase, Gauge, Hash, MapPinArea, Scales, Sparkle, SpinnerGap, Users } from '@phosphor-icons/react';
import type { CasebookPayload, QueueItem } from '../../types/api';
import { glassCreamIcon, glassCreamSurface } from '../shared/glassStyles';
import { ScoreRing } from '../shared/ScoreRing';
import { regionCenterByKey } from './regionGeometry';

type SelectedCasePreviewProps = {
  id?: string;
  item?: QueueItem;
  casebook?: CasebookPayload | null;
  loadingFactors?: boolean;
  onOpen: () => void;
  onOpenArchiveDetails?: () => void;
  onOpenLocation?: (regionKey: string) => void;
};

export function SelectedCasePreview({ id, item, casebook, loadingFactors = false, onOpen, onOpenArchiveDetails, onOpenLocation }: SelectedCasePreviewProps) {
  if (!item) return null;
  const factors = casebook?.factors.slice(0, 5) ?? [];
  const isArchiveOnlyRow = item.source_split === 'train_data' || item.is_heldout === false;
  const rankLabel = item.archive_rank ?? item.risk_rank;
  const actionLabel = isArchiveOnlyRow ? 'Open Archive Details' : 'Open Casebook';
  const handleOpen = isArchiveOnlyRow ? (onOpenArchiveDetails ?? onOpen) : onOpen;
  const scorePercent = Math.round(Math.max(0, Math.min(1, item.probability)) * 100);
  const inferredLocation = buyerLocation(item);

  return (
    <section id={id} className="card" aria-label="Selected use case" style={{ padding: 16, display: 'grid', gap: 12, position: 'relative', overflow: 'visible', minWidth: 0, background: 'var(--lp-panel)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...titleClamp, margin: 0 }}>{item.package_title}</h2>
        </div>
        <span style={{ borderRadius: 999, padding: '.42rem .62rem', color: 'var(--lp-bg-deep)', fontWeight: 820, display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, ...glassCreamSurface }}><Hash size={13} weight="bold" />{rankLabel}</span>
      </div>

      <dl style={{ display: 'grid', gap: 7, margin: 0, color: 'var(--lp-text-soft)', fontSize: 12 }}>
        <Row icon={<Briefcase size={13} weight="fill" />} label="Buyer" value={item.buyer} />
        <Row icon={<Users size={13} weight="fill" />} label="Supplier" value={item.supplier} />
        <Row icon={<Scales size={13} weight="fill" />} label="Value" value={item.tender_value_display} />
      </dl>

      {inferredLocation.available && (
        <div style={locationPanelStyle}>
          <div style={locationCopyStyle}>
            <MapPinArea size={17} color="#D7D1B0" weight="fill" />
            <span>
              <strong style={locationTitleStyle}>{inferredLocation.label}</strong>
              <small style={locationNoteStyle}>{inferredLocation.disclaimer}</small>
            </span>
          </div>
          <div style={locationActionsStyle}>
            {inferredLocation.regionKey && (
              <button type="button" onClick={() => onOpenLocation?.(inferredLocation.regionKey)} style={locationButtonStyle}>
                Show on map
              </button>
            )}
            <a href={inferredLocation.osmUrl} target="_blank" rel="noreferrer" style={locationLinkStyle}>
              Open OSM search
            </a>
          </div>
          {inferredLocation.coordinates && <TenderStreetMapPreview location={inferredLocation} />}
        </div>
      )}

      <div style={scorePanelStyle}>
        <ScoreRing score={item.probability} label="score" riskLabel={item.predicted_label} size={104} />
        <div style={scoreTextStyle}>
          <p style={{ color: 'var(--lp-text-soft)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Gauge size={16} color="#D7D1B0" weight="fill" /> Risk score</p>
          <strong style={scorePercentStyle}>{scorePercent}%</strong>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}><Sparkle size={16} color="#D7D1B0" weight="fill" /> Key factors</h3>
        {loadingFactors && <p style={{ color: 'var(--lp-muted)', display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}><SpinnerGap size={15} className="spin-icon" weight="bold" /> Loading factors</p>}
        {!loadingFactors && factors.length === 0 && <p style={{ color: 'var(--lp-muted)', margin: 0 }}>{isArchiveOnlyRow ? 'Open Archive Details to inspect this row.' : 'Open the casebook to inspect factor contributions.'}</p>}
        <ol style={{ display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
          {factors.map((factor, index) => (
            <li key={factor.feature} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'start', border: '1px solid rgba(255,255,255,.075)', borderRadius: 16, padding: '8px 9px', background: 'rgba(255,255,255,.035)' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 820, ...glassCreamIcon }}>{index + 1}</span>
              <span><strong style={factorTitle}>{factor.feature_label}</strong></span>
              <strong style={{ color: factor.shap_value >= 0 ? 'var(--lp-red)' : 'var(--lp-emerald)', display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-label={factor.shap_value >= 0 ? 'Increases risk' : 'Reduces risk'}>{factor.shap_value >= 0 ? <ArrowUp size={14} weight="bold" /> : <ArrowDown size={14} weight="bold" />}{factor.shap_value.toFixed(3)}</strong>
            </li>
          ))}
        </ol>
      </div>

      <button onClick={handleOpen} style={{ borderRadius: 999, padding: '.82rem 1rem', color: 'var(--lp-bg-deep)', fontWeight: 820, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...glassCreamSurface }}><ArrowSquareOut size={17} weight="fill" /> {actionLabel}</button>
    </section>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '18px 58px minmax(0, 1fr)', gap: 8, alignItems: 'start', minWidth: 0 }}><span style={{ color: 'var(--lp-cream)' }}>{icon}</span><dt style={{ color: 'var(--lp-muted)' }}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>;
}

function buyerLocation(item: QueueItem) {
  const regionLabel = cleanText(item.buyer_region);
  const regionType = cleanText(item.buyer_region_type);
  const regionKey = cleanText(item.buyer_region_key) || cleanText(item.region_key);
  const available = Boolean(regionLabel && regionLabel !== 'Tidak tersedia' && regionType !== 'unknown');
  const query = [item.buyer, regionLabel, 'Indonesia'].filter(Boolean).join(', ');
  const precision = regionType === 'kabupaten' || regionType === 'kota' ? 'kab/kota' : regionType || 'admin';
  const coordinates = regionKey ? regionCenterByKey.get(regionKey) ?? null : null;
  const mapUrl = coordinates ? buildOsmPinUrl(coordinates, regionLabel) : null;

  return {
    available,
    label: regionLabel || 'Lokasi belum tersedia',
    regionKey,
    regionType,
    coordinates,
    mapUrl,
    osmUrl: `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`,
    disclaimer: `Perkiraan ${precision} dari buyer name; bukan pin alamat jalan atau lokasi pekerjaan.`,
  };
}

function cleanText(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

type BuyerLocation = ReturnType<typeof buyerLocation>;

function TenderStreetMapPreview({ location }: { location: BuyerLocation }) {
  if (!location.coordinates || !location.mapUrl) return null;
  const [longitude, latitude] = location.coordinates;
  const embedUrl = buildOsmEmbedUrl(location.coordinates, location.regionType);

  return (
    <div style={streetMapFrameStyle}>
      <iframe
        src={embedUrl}
        title={`Approximate street map preview for ${location.label}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={streetMapIframeStyle}
      />
      <div style={streetMapMetaStyle}>
        <span style={streetMapBadgeStyle}>Approx. region center</span>
        <a href={location.mapUrl} target="_blank" rel="noreferrer" style={streetMapCoordinateStyle}>
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </a>
      </div>
    </div>
  );
}

function buildOsmEmbedUrl(coordinates: [number, number], regionType: string) {
  const [longitude, latitude] = coordinates;
  const span = regionType === 'kota' ? 0.08 : 0.22;
  const bbox = [
    longitude - span,
    latitude - span * 0.72,
    longitude + span,
    latitude + span * 0.72,
  ].map((value) => value.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function buildOsmPinUrl(coordinates: [number, number], label: string) {
  const [longitude, latitude] = coordinates;
  const zoom = label.toLocaleLowerCase('id-ID').startsWith('kota ') ? 12 : 10;
  return `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=${zoom}/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
}

const titleClamp: CSSProperties = {
  fontSize: 20,
  lineHeight: 1.02,
  display: '-webkit-box',
  WebkitLineClamp: 5,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
};

const factorTitle: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: 1.08,
  overflowWrap: 'anywhere',
};

const scorePanelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '104px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'center',
  minWidth: 0,
  padding: 10,
  border: '1px solid rgba(255,255,255,.075)',
  borderRadius: 18,
  background: 'rgba(255,255,255,.035)',
};

const scoreTextStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  justifyItems: 'start',
  minWidth: 0,
};

const scorePercentStyle: CSSProperties = {
  display: 'block',
  color: 'var(--lp-text)',
  fontSize: 28,
  lineHeight: .9,
  letterSpacing: '-.055em',
};

const locationPanelStyle: CSSProperties = {
  display: 'grid',
  gap: 9,
  padding: 10,
  border: '1px solid rgba(215,209,176,.16)',
  borderRadius: 18,
  background: 'rgba(215,209,176,.07)',
};

const locationCopyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'start',
  minWidth: 0,
};

const locationTitleStyle: CSSProperties = {
  display: 'block',
  color: 'var(--lp-text)',
  fontSize: 13,
  lineHeight: 1.15,
  overflowWrap: 'anywhere',
};

const locationNoteStyle: CSSProperties = {
  display: 'block',
  marginTop: 3,
  color: 'var(--lp-muted)',
  fontSize: 11.2,
  lineHeight: 1.25,
};

const locationActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 7,
  flexWrap: 'wrap',
};

const locationButtonStyle: CSSProperties = {
  borderRadius: 999,
  padding: '.48rem .66rem',
  color: 'var(--lp-bg-deep)',
  fontSize: 11.5,
  fontWeight: 820,
  ...glassCreamSurface,
};

const locationLinkStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 999,
  padding: '.48rem .66rem',
  color: 'var(--lp-text-soft)',
  fontSize: 11.5,
  fontWeight: 780,
  textDecoration: 'none',
  background: 'rgba(255,255,255,.055)',
};

const streetMapFrameStyle: CSSProperties = {
  position: 'relative',
  minHeight: 136,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 16,
  background: 'rgba(12,13,12,.45)',
};

const streetMapIframeStyle: CSSProperties = {
  width: '100%',
  height: 136,
  border: 0,
  display: 'block',
  filter: 'saturate(.82) contrast(.98)',
};

const streetMapMetaStyle: CSSProperties = {
  position: 'absolute',
  left: 8,
  right: 8,
  bottom: 8,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
  pointerEvents: 'none',
};

const streetMapBadgeStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 999,
  padding: '.26rem .46rem',
  color: '#f7f4e7',
  fontSize: 10.5,
  fontWeight: 820,
  background: 'rgba(18,18,16,.78)',
  backdropFilter: 'blur(10px)',
};

const streetMapCoordinateStyle: CSSProperties = {
  border: '1px solid rgba(215,209,176,.22)',
  borderRadius: 999,
  padding: '.26rem .46rem',
  color: '#D7D1B0',
  fontSize: 10.5,
  fontWeight: 820,
  textDecoration: 'none',
  background: 'rgba(18,18,16,.78)',
  backdropFilter: 'blur(10px)',
  pointerEvents: 'auto',
};
