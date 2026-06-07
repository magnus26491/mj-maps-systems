/**
 * MJ Maps Systems — Turn Engine
 * OSM Road Data Fetcher
 *
 * Queries Overpass API for road geometry around a coordinate.
 * Returns a normalised OsmRoadSegment.
 */

import type { LatLng, OsmRoadSegment, OsmWayTags, OverpassResponse, ClearanceConfidence } from './types';

const QUERY_RADIUS_M = 80;
const FETCH_TIMEOUT_MS = 8_000;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ─── UNIT NORMALISATION ──────────────────────────────────────────────────────

export function parseMeasurementToMetres(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const metreMatch = s.match(/^([\d.]+)\s*m?$/);
  if (metreMatch) return parseFloat(metreMatch[1]);

  const ftInMatch = s.match(/^(\d+)\s*(?:ft|feet|')\s*(\d+)\s*(?:in|inches|")?$/);
  if (ftInMatch) return (parseInt(ftInMatch[1], 10) * 12 + parseInt(ftInMatch[2], 10)) * 0.0254;

  const ftMatch = s.match(/^([\d.]+)\s*(?:ft|feet|')$/);
  if (ftMatch) return parseFloat(ftMatch[1]) * 0.3048;

  return null;
}

// ─── CONFIDENCE ──────────────────────────────────────────────────────────────

function inferConfidence(tags: OsmWayTags): ClearanceConfidence {
  if (tags.maxwidth) return 'HIGH';
  if (tags.width)    return 'MEDIUM';
  return 'LOW';
}

// ─── FALLBACK WIDTHS ─────────────────────────────────────────────────────────

const FALLBACK_WIDTH_BY_HIGHWAY: Record<string, number> = {
  motorway:      11.0,
  trunk:          9.0,
  primary:        7.3,
  secondary:      6.5,
  tertiary:       5.5,
  unclassified:   4.8,
  residential:    4.8,
  service:        3.5,
  track:          3.0,
  bridleway:      2.5,
  footway:        1.8,
  cycleway:       2.0,
  living_street:  4.0,
  road:           4.8,
};

function estimateWidthFromClass(tags: OsmWayTags): number {
  return FALLBACK_WIDTH_BY_HIGHWAY[tags.highway ?? 'road'] ?? 4.8;
}

// ─── OSM TAG PARSER ──────────────────────────────────────────────────────────

export function parseOsmWay(
  wayId: number,
  tags: OsmWayTags,
  geometry: Array<{ lat: number; lon: number }>,
): OsmRoadSegment {
  const explicitWidth =
    parseMeasurementToMetres(tags.maxwidth) ??
    parseMeasurementToMetres(tags.width);

  const widthM = explicitWidth ?? estimateWidthFromClass(tags);

  const hasTurningHead =
    tags.turning_circle === 'yes' ||
    tags.highway === 'turning_circle' ||
    tags.highway === 'turning_loop' ||
    tags.junction === 'roundabout';

  const isDeadEnd =
    tags.noexit === 'yes' ||
    tags.dead_end === 'yes';

  return {
    wayId,
    tags,
    widthM,
    maxHeightM: parseMeasurementToMetres(tags.maxheight),
    maxWeightT: tags.maxweight ? parseFloat(tags.maxweight) : null,
    hasTurningHead,
    isDeadEnd,
    lengthToEndM: computeWayLength(geometry),
    confidence: inferConfidence(tags),
    lastEdited: null,
  };
}

// ─── GEOMETRY UTILS ──────────────────────────────────────────────────────────

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

function computeWayLength(geometry: Array<{ lat: number; lon: number }>): number {
  if (geometry.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < geometry.length - 1; i++) total += haversineM(geometry[i], geometry[i + 1]);
  return total;
}

function centroid(geo: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  return {
    lat: geo.reduce((s, p) => s + p.lat, 0) / geo.length,
    lon: geo.reduce((s, p) => s + p.lon, 0) / geo.length,
  };
}

// ─── OVERPASS ────────────────────────────────────────────────────────────────

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:10];(way[highway](around:${radiusM},${lat},${lng}););out body geom;`.trim();
}

async function fetchWithTimeout(url: string, body: string, timeoutMs: number): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(body)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return (await res.json()) as OverpassResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNearestRoadSegment(
  location: LatLng,
  radiusM = QUERY_RADIUS_M,
): Promise<OsmRoadSegment | null> {
  const query = buildOverpassQuery(location.lat, location.lng, radiusM);
  let data: OverpassResponse | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      data = await fetchWithTimeout(endpoint, query, FETCH_TIMEOUT_MS);
      break;
    } catch (err) {
      console.warn(`[turn-engine] Overpass ${endpoint} failed:`, err);
    }
  }

  if (!data || data.elements.length === 0) return null;

  const ways = data.elements.filter(el => el.type === 'way' && el.geometry && el.tags);
  if (ways.length === 0) return null;

  const loc = { lat: location.lat, lon: location.lng };
  ways.sort((a, b) =>
    haversineM(loc, centroid(a.geometry!)) - haversineM(loc, centroid(b.geometry!)),
  );

  const nearest = ways[0];
  return parseOsmWay(nearest.id, nearest.tags!, nearest.geometry!);
}
