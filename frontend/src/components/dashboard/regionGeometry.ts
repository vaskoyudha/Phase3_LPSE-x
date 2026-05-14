import mapDataRaw from '../../assets/maps/indonesia-kabupaten-kota.geojson?raw';

export type MapFeature = {
  type: 'Feature';
  properties: {
    name: string;
    province: string;
    region_type: 'kabupaten' | 'kota' | string;
    map_key: string;
  };
  geometry: unknown;
};

export type FeatureCollection = {
  type: 'FeatureCollection';
  features: MapFeature[];
};

type CoordinateBounds = {
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
};

export const mapData = JSON.parse(mapDataRaw) as FeatureCollection;
export const mapFeatures = mapData.features;
export const regionCenterByKey = buildRegionCenterMap(mapFeatures);

function buildRegionCenterMap(featureList: MapFeature[]) {
  const centers = new Map<string, [number, number]>();
  featureList.forEach((feature) => {
    const center = featureCenter(feature);
    if (center && isUsableCoordinate(center)) centers.set(feature.properties.map_key, center);
  });
  return centers;
}

function featureCenter(feature: MapFeature): [number, number] | null {
  const bounds: CoordinateBounds = {
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY,
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
  };
  collectCoordinateBounds(feature.geometry, bounds);
  if (!Number.isFinite(bounds.minLongitude) || !Number.isFinite(bounds.minLatitude)) return null;
  return [
    (bounds.minLongitude + bounds.maxLongitude) / 2,
    (bounds.minLatitude + bounds.maxLatitude) / 2,
  ];
}

function collectCoordinateBounds(value: unknown, bounds: CoordinateBounds) {
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [longitude, latitude] = value;
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        bounds.minLongitude = Math.min(bounds.minLongitude, longitude);
        bounds.maxLongitude = Math.max(bounds.maxLongitude, longitude);
        bounds.minLatitude = Math.min(bounds.minLatitude, latitude);
        bounds.maxLatitude = Math.max(bounds.maxLatitude, latitude);
      }
      return;
    }
    value.forEach((child) => collectCoordinateBounds(child, bounds));
    return;
  }

  if (value && typeof value === 'object' && 'coordinates' in value) {
    collectCoordinateBounds((value as { coordinates?: unknown }).coordinates, bounds);
  }
}

function isUsableCoordinate(value: [number, number]): value is [number, number] {
  const [longitude, latitude] = value;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= 90 && longitude <= 145 && latitude >= -16 && latitude <= 12;
}
