// Authoritative province-code / path-id normalization.
// Single source for NusantaraAtlasCarousel (overview) and LokasiMap (lokasi SVG backup).
// DO NOT add SG — it is an orphan code with zero entries in KABUPATEN_TO_PROVINCE.

export function normalizeProvinceKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/^(kabupaten administrasi|kota administrasi|kabupaten|kota|provinsi|propinsi)\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pathIdToRegionKey(id: string): string {
  return id
    .replace(/_/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

export const PRIMARY_NAME_BY_CODE: Record<string, string> = {
  // Sumatera
  AC: 'aceh',
  SU: 'sumatera-utara',
  SB: 'sumatera-barat',
  RI: 'riau',
  JA: 'jambi',
  BE: 'bengkulu',
  SS: 'sumatera-selatan',
  LA: 'lampung',
  BB: 'kepulauan-bangka-belitung',
  KR: 'kepulauan-riau',
  // Jawa
  JK: 'jakarta',
  JB: 'jawa-barat',
  JT: 'jawa-tengah',
  YO: 'yogyakarta',
  JI: 'jawa-timur',
  BT: 'banten',
  // Nusa Tenggara
  BA: 'bali',
  NB: 'nusa-tenggara-barat',
  NT: 'nusa-tenggara-timur',
  // Kalimantan
  KB: 'kalimantan-barat',
  KT: 'kalimantan-tengah',
  KS: 'kalimantan-selatan',
  KI: 'kalimantan-timur',
  KU: 'kalimantan-utara',
  // Sulawesi
  SA: 'sulawesi-utara',
  ST: 'sulawesi-tengah',
  SE: 'sulawesi-tenggara',
  SN: 'sulawesi-selatan',
  SR: 'sulawesi-barat',
  GO: 'gorontalo',
  // Maluku
  MA: 'maluku',
  MU: 'maluku-utara',
  // Papua
  PA: 'papua',
  PB: 'papua-barat',
  PS: 'papua-selatan',
  PT: 'papua-tengah',
  PP: 'papua-pegunungan',
  PD: 'papua-barat-daya',
};

export const CODE_BY_NORMALIZED_NAME: Record<string, string> = {
  aceh: 'AC',
  'sumatera-utara': 'SU',
  'sumatera-barat': 'SB',
  riau: 'RI',
  jambi: 'JA',
  bengkulu: 'BE',
  'sumatera-selatan': 'SS',
  lampung: 'LA',
  'kepulauan-bangka-belitung': 'BB',
  'kepulauan-riau': 'KR',
  jakarta: 'JK',
  'dki-jakarta': 'JK',
  'daerah-khusus-ibukota-jakarta': 'JK',
  'jawa-barat': 'JB',
  'jawa-tengah': 'JT',
  yogyakarta: 'YO',
  'daerah-istimewa-yogyakarta': 'YO',
  'di-yogyakarta': 'YO',
  'jawa-timur': 'JI',
  banten: 'BT',
  bali: 'BA',
  'nusa-tenggara-barat': 'NB',
  'nusa-tenggara-timur': 'NT',
  'kalimantan-barat': 'KB',
  'kalimantan-tengah': 'KT',
  'kalimantan-selatan': 'KS',
  'kalimantan-timur': 'KI',
  'kalimantan-utara': 'KU',
  'sulawesi-utara': 'SA',
  'sulawesi-tengah': 'ST',
  'sulawesi-tenggara': 'SE',
  'sulawesi-selatan': 'SN',
  'sulawesi-barat': 'SR',
  gorontalo: 'GO',
  maluku: 'MA',
  'maluku-utara': 'MU',
  papua: 'PA',
  'papua-barat': 'PB',
  'papua-selatan': 'PS',
  'papua-tengah': 'PT',
  'papua-pegunungan': 'PP',
  'papua-barat-daya': 'PD',
};

export const PROVINCE_CODES = [
  'AC','SU','SB','RI','JA','BE','SS','LA','BB','KR',
  'JK','JB','JT','YO','JI','BT',
  'BA','NB','NT',
  'KB','KT','KS','KI','KU',
  'SA','ST','SE','SN','SR','GO',
  'MA','MU',
  'PA','PB','PS','PT','PP','PD',
] as const;

export type ProvinceCode = typeof PROVINCE_CODES[number];
