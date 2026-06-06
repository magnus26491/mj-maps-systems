/**
 * MJ Maps Systems — Turn Engine
 * OSM Road Data Fetcher
 *
 * Queries the Overpass API for road geometry around a coordinate.
 * Parses maxwidth, maxheight, maxweight, turning_circle, noexit tags.
 * Normalises all measurements to metres (handles 'ft', 'ft in', 'm' suffixes).
 *
 * Overpass endpoint: https://overpass-api.de/api/interpreter
 * Fallback mirror:   https://maps.mail.ru/osm/tools/overpass/api/interpreter
 */

import type { LatLng, OsmRoadSegment, OsmWayTags, OverpassResponse } from './types';
import type { ClearanceConfidence } from '../../../packages/vehicle-profiles/index';

/** Radius in metres around the stop point to query */
const QUERY_RADIUS_M = 80;

/** Overpass endpoints — primary + fallback mirror */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** Timeout per Overpass request in ms */
const FETCH_TIMEOUT_MS = 8_000;

// ─── UNIT NORMALISATION ──────────────────────────────────────────────────────

/**
 * Parse an OSM measurement string to metres.
 * Handles: '4.5', '4.5 m', '15 ft', "11'6\"", '11 ft 6 in', '3.2m'
 * Returns null if unparseable.
 */
export function parseMeasurementToMetres(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  // Pure number or number with 'm' suffix — already metres
  const metreMatch = s.match(/^([\d.]+)\s*m?$/);
  if (metreMatch) return parseFloat(metreMatch[1]);

  // Feet and inches: "11ft 6in" | "11'6\"" | "11 ft 6 in" | "11feet6inches"
  const ftInMatch = s.match(/^(\d+)\s*(?:ft|feet|')\s*(\d+)\s*(?:in|inches|")?$/);
  if (ftInMatch) {
    const feet = parseInt(ftInMatch[1], 10);
    const inches = parseInt(ftInMatch[2], 10);
    return (feet * 12 + inches) * 0.0254;
  }

  // Feet only: "15ft" | "15 ft" | "15'"
  const ftMatch = s.match(/^([\d.]+)\s*(?:ft|feet|')$/);
  if (ftMatch) return parseFloat(ftMatch[1]) * 0.3048;

  return null;
}

// ─── CONFIDENCE INFERENCE ────────────────────────────────────────────────────

/**
 * Infer data confidence from tag presence:
 * HIGH   = explicit maxwidth tag (surveyed)
 * MEDIUM = width tag only (may be carriageway not kerb-to-kerb)
 * LOW    = inferred from highway classification only
 */
function inferConfidence(tags: OsmWayTags): ClearanceConfidence {
  if (tags.maxwidth) return 'HIGH';
  if (tags.width)    return 'MEDIUM';
  return 'LOW';
}

// ─── FALLBACK WIDTH ESTIMATES BY ROAD CLASS ──────────────────────────────────

/**
 * When no explicit width tag exists, estimate from UK highway classifications.
 * Sources: Manual for Streets (2007), HD 36/06, DMRB
 */
const FALLBACK_WIDTH_BY_HIGHWAY: Record<string, number> = {
  motorway:       11.0,
  trunk:           9.0,
  primary:         7.3,
  secondary:       6.5,
  tertiary:        5.5,
  unclassified:    4.8,
  residential:     4.8,
  service:         3.5,
  track:           3.0,
  bridleway:       2.5,
  footway:         1.8,
  cycleway:        2.0,
  living_street:   4.0,
  road:            4.8,  // unknown classification default
};

function estimateWidthFromClass(tags: OsmWayTags): number {
  const hw = tags.highway ?? 'road';
  return FALLBACK_WIDTH_BY_HIGHWAY[hw] ?? 4.8;
}

// ─── OSM TAG PARSER ──────────────────────────────────────────────────────────

export function parseOsmWay(
  osmWayId: number,
  tags: OsmWayTags,
  geometry: Array<{ lat: number; lon: number }>,
): OsmRoadSegment {
  // Width: prefer maxwidth (kerb-to-kerb), fallback to width, then class estimate
  const explicitWidth =
    parseMeasurementToMetres(tags.maxwidth) ??
    parseMeasurementToMetres(tags.width);

  const widthM = explicitWidth ?? estimateWidthFromClass(tags);

  // Compute segment length from geometry nodes
  const lengthToEndM = computeWayLength(geometry);

  const hasTurningHead =
    tags['turning_circle'] === 'yes' ||
    tags['highway'] === 'turning_circle' ||
    tags['highway'] === 'turning_loop' ||
    tags['junction'] === 'roundabout';

  const isDeadEnd =
    tags['noexit'] === 'yes' ||
    tags['dead_end'] === 'yes';

  return {
    osmWayId,
    tags,
    widthM,
    maxHeightM: parseMeasurementToMetres(tags.maxheight),
    maxWeightT: tags.maxweight ? parseFloat(tags.maxweight) : null,
    hasTurningHead,
    isDeadEnd,
    lengthToEndM,
    confidence: inferConfidence(tags),
    lastEdited: null, // populated by enrichWithMetadata if needed
  };
}

// ─── GEOMETRY UTILS ──────────────────────────────────────────────────────────

/** Haversine distance between two lat/lon points in metres */
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
  for (let i = 0; i < geometry.length - 1; i++) {
    total += haversineM(geometry[i], geometry[i + 1]);
  }
  return total;
}

// ─── OVERPASS QUERY BUILDER ──────────────────────────────────────────────────

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  return `
[out:json][timeout:10];
(
  way[highway](around:${radiusM},${lat},${lng});
);
out body geom;
`.trim();
}

// ─── HTTP FETCH WITH TIMEOUT + FALLBACK ──────────────────────────────────────

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
    return await res.json() as OverpassResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Fetch OSM road segments around a point.
 * Tries primary Overpass endpoint, falls back to mirror on failure.
 * Returns the single nearest matching road segment.
 */
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
      console.warn(`[turn-engine] Overpass endpoint ${endpoint} failed:`, err);
    }
  }

  if (!data || data.elements.length === 0) return null;

  // Filter to way elements only, find the nearest to our point
  const ways = data.elements.filter(el => el.type === 'way' && el.geometry && el.tags);
  if (ways.length === 0) return null;

  // Pick the closest way centroid to our query location
  const loc = { lat: location.lat, lon: location.lng };
  ways.sort((a, b) => {
    const aGeo = a.geometry!;
    const bGeo = b.geometry!;
    const aCentroid = centroid(aGeo);
    const bCentroid = centroid(bGeo);
    return haversineM(loc, aCentroid) - haversineM(loc, bCentroid);
  });

  const nearest = ways[0];
  return parseOsmWay(nearest.id, nearest.tags!, nearest.geometry!);
}

function centroid(geo: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const lat = geo.reduce((s, p) => s + p.lat, 0) / geo.length;
  const lon = geo.reduce((s, p) => s + p.lon, 0) / geo.length;
  return { lat, lon };
}
