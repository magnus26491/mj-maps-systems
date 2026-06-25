/**
 * MJ Maps Systems — Parking & Loading Bay Engine
 *
 * For each stop coordinate, finds:
 *  - Nearest legal loading bay / loading zone
 *  - Estimated walk distance from parking to front door
 *  - Any stopping restrictions (double yellow, clearway, bus stop conflicts)
 *  - Max permitted stopping duration
 *  - Suggested parking spot GPS
 *
 * Data source: OpenStreetMap via Overpass API
 * Used by: stop-intelligence.ts, trolley-advisory.ts
 */

import { runOverpassQuery } from '../osm/overpass-client';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ParkingRestriction =
  | 'LOADING_BAY'        // Dedicated loading bay — legal, time-limited
  | 'LOADING_ZONE'       // Marked loading zone on carriageway
  | 'DOUBLE_YELLOW'      // No waiting — loading may still be permitted briefly
  | 'SINGLE_YELLOW'      // Time-restricted waiting
  | 'CLEARWAY'           // No stopping at any time
  | 'BUS_STOP'           // Must not obstruct
  | 'RESIDENTIAL_PERMIT' // Permit zone — delivery loading usually exempt
  | 'UNRESTRICTED'       // No markings detected within radius
  | 'UNKNOWN';

export interface NearestParkingSpot {
  /** GPS of the nearest legal stopping / loading point */
  lat: number;
  lng: number;
  /** Straight-line distance from stop address to parking spot (metres) */
  distanceToStopM: number;
  /** Estimated walk distance from parking spot to front door (metres) */
  walkDistanceM: number;
  /** Best restriction type at this spot */
  restriction: ParkingRestriction;
  /** Max stopping duration in minutes (null = no limit / unknown) */
  maxStopMinutes: number | null;
  /** Human-readable label e.g. "Loading bay — 18m ahead on left" */
  label: string;
  /** OSM node/way id for reference */
  osmId?: number;
}

export interface ParkingIntelligence {
  nearest: NearestParkingSpot | null;
  /** All spots found within search radius, sorted by distance */
  allSpots: NearestParkingSpot[];
  /** Whether the immediate frontage has a stopping restriction */
  frontageClear: boolean;
  /** Any bus stop within 15m of the stop address */
  busStopConflict: boolean;
  /** Summary advisory for the driver card */
  advisory: string;
}

// ─── HAVERSINE ───────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Walk distance adds ~20% over straight-line to account for pavement routing
const WALK_FACTOR = 1.2;

// ─── OVERPASS QUERY ──────────────────────────────────────────────────────────

function buildParkingQuery(lat: number, lng: number, radiusM = 80): string {
  return `
[out:json][timeout:12];
(
  // Loading bays and docks
  node["amenity"="loading_dock"](around:${radiusM},${lat},${lng});
  way["amenity"="loading_dock"](around:${radiusM},${lat},${lng});
  node["parking"="loading"](around:${radiusM},${lat},${lng});
  way["parking"="loading"](around:${radiusM},${lat},${lng});

  // Marked loading zones on carriageway
  way["highway"="service"]["service"="loading"](around:${radiusM},${lat},${lng});

  // Bus stops (conflict risk)
  node["highway"="bus_stop"](around:15,${lat},${lng});

  // Parking restrictions on roads
  way["restriction"~"no_stopping|no_waiting|clearway"](around:${radiusM},${lat},${lng});
  way["parking:lane:left"~"no_stopping|no_waiting"](around:40,${lat},${lng});
  way["parking:lane:right"~"no_stopping|no_waiting"](around:40,${lat},${lng});
  way["parking:lane:both"~"no_stopping|no_waiting"](around:40,${lat},${lng});

  // Single/double yellow equivalents in OSM
  way["parking:lane:left"="no_parking"](around:40,${lat},${lng});
  way["parking:lane:right"="no_parking"](around:40,${lat},${lng});

  // Unrestricted parking bays nearby
  node["amenity"="parking"](around:${radiusM},${lat},${lng});
  way["amenity"="parking"](around:${radiusM},${lat},${lng});
);
out body center;
  `.trim();
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

function classifyRestriction(tags: Record<string, string>): ParkingRestriction {
  if (tags.amenity === 'loading_dock' || tags.parking === 'loading' || tags.service === 'loading')
    return 'LOADING_BAY';
  if (tags.highway === 'bus_stop')
    return 'BUS_STOP';
  if (
    tags.restriction === 'no_stopping' ||
    tags['parking:lane:left'] === 'no_stopping' ||
    tags['parking:lane:right'] === 'no_stopping' ||
    tags['parking:lane:both'] === 'no_stopping'
  ) return 'CLEARWAY';
  if (
    tags.restriction === 'no_waiting' ||
    tags['parking:lane:left'] === 'no_waiting' ||
    tags['parking:lane:right'] === 'no_waiting' ||
    tags['parking:lane:both'] === 'no_waiting'
  ) return 'DOUBLE_YELLOW';
  if (
    tags['parking:lane:left'] === 'no_parking' ||
    tags['parking:lane:right'] === 'no_parking'
  ) return 'SINGLE_YELLOW';
  if (tags.amenity === 'parking') return 'UNRESTRICTED';
  return 'UNKNOWN';
}

function getMaxStopMinutes(restriction: ParkingRestriction): number | null {
  switch (restriction) {
    case 'LOADING_BAY':        return 40;   // UK standard loading bay limit
    case 'LOADING_ZONE':       return 20;
    case 'DOUBLE_YELLOW':      return 5;    // Brief loading usually tolerated
    case 'SINGLE_YELLOW':      return 30;   // Varies by time of day
    case 'CLEARWAY':           return 0;    // Never stop
    case 'BUS_STOP':           return 0;
    case 'UNRESTRICTED':       return null;
    case 'RESIDENTIAL_PERMIT': return null; // Exempt for deliveries
    default:                   return null;
  }
}

function buildLabel(restriction: ParkingRestriction, distanceM: number, maxMins: number | null): string {
  const dist = distanceM < 5 ? 'at stop' : `${Math.round(distanceM)}m away`;
  switch (restriction) {
    case 'LOADING_BAY':   return `Loading bay — ${dist}${maxMins ? ` (max ${maxMins} min)` : ''}`;
    case 'LOADING_ZONE':  return `Loading zone — ${dist}`;
    case 'DOUBLE_YELLOW': return `Double yellow — brief loading only (${dist})`;
    case 'SINGLE_YELLOW': return `Single yellow — check hours (${dist})`;
    case 'CLEARWAY':      return `⚠️ Clearway — do not stop`;
    case 'BUS_STOP':      return `⚠️ Bus stop conflict — do not obstruct`;
    case 'UNRESTRICTED':  return `Unrestricted parking — ${dist}`;
    default:              return `Parking — ${dist}`;
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Get full parking intelligence for a stop coordinate.
 *
 * @example
 * const p = await getParkingIntelligence(51.5074, -0.1278);
 * // p.nearest.restriction    → 'LOADING_BAY'
 * // p.nearest.walkDistanceM  → 14
 * // p.advisory               → 'Loading bay — 14m ahead. Max 40 min.'
 */
export async function getParkingIntelligence(
  lat: number,
  lng: number,
  radiusM = 80,
): Promise<ParkingIntelligence> {
  const query = buildParkingQuery(lat, lng, radiusM);
  const data  = await runOverpassQuery(query);

  const elements = data.elements ?? [];
  const spots: NearestParkingSpot[] = [];
  let busStopConflict = false;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const restriction = classifyRestriction(tags);

    if (restriction === 'BUS_STOP') {
      busStopConflict = true;
      continue;
    }

    // Get coordinate — nodes have lat/lng directly, ways use center
    const elLat: number = el.lat ?? el.center?.lat;
    const elLng: number = el.lon ?? el.center?.lon;
    if (!elLat || !elLng) continue;

    const distanceToStopM = haversineM(lat, lng, elLat, elLng);
    const walkDistanceM   = Math.round(distanceToStopM * WALK_FACTOR);
    const maxStopMinutes  = getMaxStopMinutes(restriction);

    spots.push({
      lat: elLat,
      lng: elLng,
      distanceToStopM: Math.round(distanceToStopM),
      walkDistanceM,
      restriction,
      maxStopMinutes,
      label: buildLabel(restriction, distanceToStopM, maxStopMinutes),
      osmId: el.id,
    });
  }

  // Sort: loading bays first, then by distance
  const priority: ParkingRestriction[] = [
    'LOADING_BAY', 'LOADING_ZONE', 'UNRESTRICTED',
    'SINGLE_YELLOW', 'DOUBLE_YELLOW', 'CLEARWAY', 'BUS_STOP', 'UNKNOWN',
  ];
  spots.sort((a, b) => {
    const pa = priority.indexOf(a.restriction);
    const pb = priority.indexOf(b.restriction);
    if (pa !== pb) return pa - pb;
    return a.distanceToStopM - b.distanceToStopM;
  });

  const nearest = spots[0] ?? null;

  // Frontage clear = no clearway/bus stop directly at the address
  const frontageClear = !spots.some(
    s => (s.restriction === 'CLEARWAY' || s.restriction === 'BUS_STOP') && s.distanceToStopM < 10
  );

  // Build advisory string
  let advisory = 'No parking data available.';
  if (nearest) {
    advisory = nearest.label;
    if (busStopConflict) advisory += ' ⚠️ Bus stop nearby — check before stopping.';
    if (!frontageClear)  advisory += ' No stopping directly outside.';
  }

  return { nearest, allSpots: spots, frontageClear, busStopConflict, advisory };
}

/**
 * Batch fetch parking intelligence for multiple stops.
 */
export async function getParkingIntelligenceBatch(
  points: Array<{ id: string; lat: number; lng: number }>,
  concurrency = 6,
): Promise<Map<string, ParkingIntelligence>> {
  const results = new Map<string, ParkingIntelligence>();
  const queue   = [...points];

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      try {
        results.set(p.id, await getParkingIntelligence(p.lat, p.lng));
      } catch {
        results.set(p.id, {
          nearest: null,
          allSpots: [],
          frontageClear: true,
          busStopConflict: false,
          advisory: 'Parking data unavailable.',
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
