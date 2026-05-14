/**
 * Island Group definitions for carousel-style map navigation.
 * Each group represents a major Indonesian island/archipelago with its
 * constituent provinces and approximate SVG bounding box for focused view.
 */

export interface IslandGroup {
  /** Matches the region field in ProvinceData (game-data.ts) */
  id: string;
  /** i18n key for the island name */
  nameKey: string;
  /** Decorative emoji for the island */
  emoji: string;
  /** Province codes belonging to this island group */
  provinceCodes: string[];
  /** Approximate bounding box within SVG viewBox (0 0 818.1 353.47) */
  boundingBox: { x: number; y: number; width: number; height: number };
  /** Accent color used in UI elements (dot indicators, etc.) */
  color: string;
}

/**
 * West-to-east ordering. Default starting island: "jawa" (index 1).
 * Bounding boxes are initial estimates — will be tuned at runtime via getBBox().
 */
export const ISLAND_GROUPS: IslandGroup[] = [
  {
    id: "sumatera",
    nameKey: "map.islands.sumatera",
    emoji: "\uD83C\uDF34",
    provinceCodes: ["AC", "SU", "SB", "RI", "JA", "SS", "BE", "LA", "BB", "KR"],
    boundingBox: { x: 0, y: 30, width: 260, height: 310 },
    color: "#58CC02",
  },
  {
    id: "jawa",
    nameKey: "map.islands.jawa",
    emoji: "\uD83C\uDFDB\uFE0F",
    provinceCodes: ["JK", "JB", "JT", "YO", "JI", "BT"],
    boundingBox: { x: 200, y: 200, width: 250, height: 100 },
    color: "#FF9600",
  },
  {
    id: "nusa_tenggara",
    nameKey: "map.islands.nusaTenggara",
    emoji: "\uD83C\uDFD6\uFE0F",
    provinceCodes: ["BA", "NB", "NT"],
    boundingBox: { x: 400, y: 210, width: 200, height: 80 },
    color: "#FF4B4B",
  },
  {
    id: "kalimantan",
    nameKey: "map.islands.kalimantan",
    emoji: "\uD83C\uDF3F",
    provinceCodes: ["KB", "KT", "KS", "KI", "KU"],
    boundingBox: { x: 250, y: 20, width: 220, height: 220 },
    color: "#FFC800",
  },
  {
    id: "sulawesi",
    nameKey: "map.islands.sulawesi",
    emoji: "\uD83C\uDF0A",
    provinceCodes: ["SA", "ST", "SE", "SN", "SG", "GO", "SR"],
    boundingBox: { x: 460, y: 30, width: 150, height: 210 },
    color: "#1CB0F6",
  },
  {
    id: "maluku",
    nameKey: "map.islands.maluku",
    emoji: "\uD83C\uDFDD\uFE0F",
    provinceCodes: ["MA", "MU"],
    boundingBox: { x: 590, y: 40, width: 120, height: 180 },
    color: "#CE82FF",
  },
  {
    id: "papua",
    nameKey: "map.islands.papua",
    emoji: "\u26F0\uFE0F",
    provinceCodes: ["PA", "PB", "PS", "PT", "PP", "PD"],
    boundingBox: { x: 680, y: 30, width: 140, height: 230 },
    color: "#2DD4BF",
  },
];

/** Default starting island when entering island mode */
export const DEFAULT_ISLAND_ID = "jawa";

/** Get the island group that contains a given province code */
export function getIslandGroupForProvince(provinceCode: string): IslandGroup | undefined {
  return ISLAND_GROUPS.find((g) => g.provinceCodes.includes(provinceCode));
}

/** Get the next island group in the carousel (wraps around) */
export function getNextIslandGroup(currentId: string): IslandGroup {
  const idx = ISLAND_GROUPS.findIndex((g) => g.id === currentId);
  return ISLAND_GROUPS[(idx + 1) % ISLAND_GROUPS.length];
}

/** Get the previous island group in the carousel (wraps around) */
export function getPrevIslandGroup(currentId: string): IslandGroup {
  const idx = ISLAND_GROUPS.findIndex((g) => g.id === currentId);
  return ISLAND_GROUPS[(idx - 1 + ISLAND_GROUPS.length) % ISLAND_GROUPS.length];
}

/** Get an island group by its id */
export function getIslandGroupById(id: string): IslandGroup | undefined {
  return ISLAND_GROUPS.find((g) => g.id === id);
}

/** Get all province codes for a given island group id */
export function getProvinceCodesForIsland(islandId: string): string[] {
  return ISLAND_GROUPS.find((g) => g.id === islandId)?.provinceCodes ?? [];
}
