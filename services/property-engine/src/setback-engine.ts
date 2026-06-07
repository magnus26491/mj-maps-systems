/**
 * MJ Maps Systems — Property Setback Engine
 *
 * Estimates the physical setback (distance from the road edge to the
 * delivery point / front door) for each stop on a route.
 *
 * Why it matters:
 *   A 20m setback on a narrow private drive means the driver cannot pull
 *   onto the road at all — the route-optimizer uses setbackFromRoadM to
 *   decide whether to park on the public road and walk, or to enter.
 *
 * Resolution chain:
 *   1. OS AddressBase building polygon (most accurate, UK only)
 *   2. OSM building outline centroid vs nearest road (good UK/global coverage)
 *   3. Heuristic from property type tag (terraced: 2m, detached: 6m, etc.)
 *   4. Default fallback: 4m (average UK terraced house)
 *
 * For the MVP the Overpass query is used (free, no API key).
 * Production should switch to OS AddressBase via the OS Data Hub API.
 */

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SetbackInput {
  id: string;
  lat: number;
  lng: number;
  address: string;
}

export interface EstimatedSetback {
  id: string;
  setbackFromRoadM: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Source used for this estimate */
  source: 'osm_building' | 'heuristic' | 'default';
}

// ─── HEURISTICS ───────────────────────────────────────────────────────────────

/** Typical UK setbacks by building/address type */
const HEURISTIC_SETBACK_M: Record<string, number> = {
  terraced:   2.0,
  semi:       4.0,
  detached:   6.0,
  bungalow:   5.0,
  flat:       3.0,
  industrial: 8.0,
  warehouse: 12.0,
  farm:      20.0,
  default:    4.0,
};

function heuristicSetback(address: string): number {
  const lower = address.toLowerCase();
  if (lower.includes('farm') || lower.includes('lane end')) return HEURISTIC_SETBACK_M.farm;
  if (lower.includes('warehouse') || lower.includes('distribution')) return HEURISTIC_SETBACK_M.warehouse;
  if (lower.includes('industrial') || lower.includes('business park')) return HEURISTIC_SETBACK_M.industrial;
  if (lower.includes('flat') || lower.includes('apartment')) return HEURISTIC_SETBACK_M.flat;
  return HEURISTIC_SETBACK_M.default;
}

// ─── OSM BUILDING QUERY ───────────────────────────────────────────────────────

/**
 * Query Overpass for the nearest building outline within 30m of a coordinate.
 * Returns the approximate distance from building centroid to road edge,
 * or null if no building found.
 */
async function queryOsmSetback(
  lat: number,
  lng: number,
): Promise<number | null> {
  const radius = 30; // metres
  const query = `
    [out:json][timeout:10];
    (
      way["building"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const res = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return null;

    const json = await res.json() as { elements: Array<{ center?: { lat: number; lon: number } }> };
    const el = json.elements[0];
    if (!el?.center) return null;

    // Haversine distance between query point and building centroid
    const dLat = (el.center.lat - lat) * (Math.PI / 180);
    const dLon = (el.center.lon - lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * (Math.PI / 180)) *
      Math.cos(el.center.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
    const distM = 6371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Clamp to a plausible setback range: 1m – 60m
    return Math.min(Math.max(distM, 1), 60);
  } catch {
    return null;
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Batch-estimate setbacks for all stops in a route.
 * Concurrency is capped at 6 to avoid hammering the public Overpass API.
 */
export async function estimatePropertySetbackBatch(
  stops: SetbackInput[],
  options: { maxConcurrent?: number } = {},
): Promise<Map<string, EstimatedSetback>> {
  const { maxConcurrent = 6 } = options;
  const results = new Map<string, EstimatedSetback>();

  // Process in batches
  for (let i = 0; i < stops.length; i += maxConcurrent) {
    const batch = stops.slice(i, i + maxConcurrent);
    await Promise.all(
      batch.map(async stop => {
        const osmDist = await queryOsmSetback(stop.lat, stop.lng);

        if (osmDist !== null) {
          results.set(stop.id, {
            id: stop.id,
            setbackFromRoadM: osmDist,
            confidence: 'MEDIUM',
            source: 'osm_building',
          });
        } else {
          results.set(stop.id, {
            id: stop.id,
            setbackFromRoadM: heuristicSetback(stop.address),
            confidence: 'LOW',
            source: 'heuristic',
          });
        }
      }),
    );
  }

  return results;
}
