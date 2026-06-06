/**
 * OSM Client — Overpass API wrapper
 * Fetches road geometry, width, turn restrictions, junction types
 * and turning-head / lay-by identification around a coordinate.
 */

import axios from 'axios';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  nodes: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface RoadSegment {
  wayId: number;
  name?: string;
  highway: string;
  /** Kerb-to-kerb width in metres. Derived from OSM width tag or highway-class default. */
  widthM: number;
  maxWeightT?: number;
  maxHeightM?: number;
  maxWidthM?: number;
  oneway: boolean;
  privateAccess: boolean;
  deadEnd: boolean;
  hasTurningHead: boolean;
  hasLayby: boolean;
  /** Estimated diameter of largest available turning space in metres */
  turningDiameterM?: number;
}

/** Default kerb-to-kerb widths per OSM highway class (metres) */
const HIGHWAY_WIDTH_DEFAULTS: Record<string, number> = {
  motorway: 11.0,
  trunk: 9.0,
  primary: 7.3,
  secondary: 6.7,
  tertiary: 5.5,
  unclassified: 4.8,
  residential: 4.8,
  service: 3.5,
  track: 3.0,
  footway: 1.5,
  cycleway: 1.5,
  path: 1.2,
};

function parseWidth(raw: string | undefined, highway: string): number {
  if (raw) {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!isNaN(n) && n > 0) return n;
  }
  return HIGHWAY_WIDTH_DEFAULTS[highway] ?? 4.0;
}

/** Query all OSM ways within `radiusM` metres of a lat/lon. */
export async function fetchRoadsNear(
  lat: number,
  lon: number,
  radiusM = 150,
): Promise<RoadSegment[]> {
  const query = `
    [out:json][timeout:15];
    (
      way["highway"](around:${radiusM},${lat},${lon});
    );
    out body geom;
  `;
  const { data } = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20_000,
  });

  const segments: RoadSegment[] = [];
  for (const el of (data.elements ?? []) as OsmWay[]) {
    if (el.type !== 'way') continue;
    const t = el.tags ?? {};
    const highway = t['highway'] ?? 'unclassified';
    if (['footway', 'cycleway', 'path', 'steps', 'pedestrian'].includes(highway)) continue;

    const deadEnd =
      t['highway'] === 'service' && t['service'] === 'driveway'
        ? true
        : t['noexit'] === 'yes' || t['dead_end'] === 'yes';

    const hasTurningHead =
      t['amenity'] === 'turning_circle' ||
      t['highway'] === 'turning_circle' ||
      t['turning_circle'] === 'yes' ||
      (el.geometry ?? []).length >= 3 && (() => {
        // Rough: if first and last node are within 5m it's a loop/turning head
        const g = el.geometry!;
        const dx = (g[0].lon - g[g.length - 1].lon) * 111_000 * Math.cos((lat * Math.PI) / 180);
        const dy = (g[0].lat - g[g.length - 1].lat) * 111_000;
        return Math.sqrt(dx * dx + dy * dy) < 5;
      })();

    const hasLayby =
      t['highway'] === 'service' && (t['service'] === 'lay_by' || t['service'] === 'layby');

    segments.push({
      wayId: el.id,
      name: t['name'],
      highway,
      widthM: parseWidth(t['width'] ?? t['est_width'], highway),
      maxWeightT: t['maxweight'] ? parseFloat(t['maxweight']) : undefined,
      maxHeightM: t['maxheight'] ? parseFloat(t['maxheight']) : undefined,
      maxWidthM: t['maxwidth'] ? parseFloat(t['maxwidth']) : undefined,
      oneway: t['oneway'] === 'yes' || t['oneway'] === '1',
      privateAccess: t['access'] === 'private' || t['access'] === 'no',
      deadEnd,
      hasTurningHead,
      hasLayby,
    });
  }
  return segments;
}

/** Get the single widest/most-suitable road segment near a point (for approach scoring). */
export async function getBestRoadSegment(
  lat: number,
  lon: number,
): Promise<RoadSegment | null> {
  const roads = await fetchRoadsNear(lat, lon, 80);
  if (roads.length === 0) return null;
  return roads.sort((a, b) => b.widthM - a.widthM)[0];
}
