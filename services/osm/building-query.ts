/**
 * MJ Maps Systems — OSM Building Polygon + Entrance Fetcher
 *
 * Fetches real building context for apartment intelligence:
 *  - building:levels / addr:levels  → total floors
 *  - elevator / lift tags           → confirmed lift presence
 *  - entrance nodes                 → exact door GPS coordinates
 *  - intercom / buzzer nodes        → intercom presence
 *  - service entrance nodes         → delivery-specific entry
 *  - building type                  → residential / apartments / commercial
 *
 * Used by: services/property-engine/apartment-engine.ts
 * Replaces: the stub extractBuildingContext() placeholder
 */

import { OVERPASS_ENDPOINTS } from './overpass-client';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface OsmEntranceNode {
  osmId: number;
  lat: number;
  lng: number;
  /** main | service | staircase | garage | emergency | yes */
  entranceType: string;
  /** Whether an intercom/buzzer tag is on this node */
  hasIntercom: boolean;
  /** ref tag — sometimes has flat/stair ref */
  ref: string | null;
  /** access tag */
  access: string;
}

export interface OsmBuildingData {
  osmId: number;
  /** way | relation */
  osmType: 'way' | 'relation';
  /** building tag value: apartments | residential | commercial | mixed | yes */
  buildingType: string;
  /** Number of above-ground floors (building:levels or addr:levels) */
  totalFloors: number | null;
  /** Number of underground levels */
  undergroundFloors: number | null;
  /** elevator=yes/no tag */
  hasElevator: boolean | null;
  /** Whether any stairlift tag is present */
  hasStairlift: boolean;
  /** Building name */
  name: string | null;
  /** operator e.g. housing association */
  operator: string | null;
  /** All entrance nodes for this building */
  entrances: OsmEntranceNode[];
  /** Centroid of building polygon */
  centroidLat: number;
  centroidLng: number;
  /** Whether building has a ref/name suggesting purpose-built block */
  likelyPurposeBuilt: boolean;
  /** Build year if tagged */
  startDate: string | null;
}

// ─── OVERPASS QUERY ──────────────────────────────────────────────────────────

/**
 * Build Overpass QL query to fetch building polygon + all entrance nodes
 * within a tight radius of a property point.
 *
 * Two-pass approach:
 *  Pass 1: Find the building way/relation containing or nearest to the point
 *  Pass 2: Fetch all nodes of that building (entrances, intercoms, lifts)
 */
export function buildBuildingQuery(lat: number, lng: number, radiusM = 80): string {
  return `
[out:json][timeout:15];
(
  // Buildings within radius — way
  way["building"](around:${radiusM},${lat},${lng});

  // Buildings within radius — relation (large complex blocks)
  relation["building"](around:${radiusM},${lat},${lng});

  // Entrance nodes within radius
  node["entrance"](around:${radiusM},${lat},${lng});

  // Intercom / buzzer nodes
  node["intercom"](around:${radiusM},${lat},${lng});
  node["buzzer"](around:${radiusM},${lat},${lng});

  // Elevator nodes (sometimes tagged as separate node inside building)
  node["elevator"="yes"](around:${radiusM},${lat},${lng});
  node["highway"="elevator"](around:${radiusM},${lat},${lng});

  // Staircase nodes
  node["entrance"="staircase"](around:${radiusM},${lat},${lng});
);
out body geom;
  `.trim();
}

// ─── FETCH ────────────────────────────────────────────────────────────────────

async function fetchOverpass(query: string): Promise<any> {
  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(`All Overpass endpoints failed: ${lastError?.message}`);
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

function parseEntranceNode(el: any): OsmEntranceNode {
  const tags = el.tags ?? {};
  return {
    osmId: el.id,
    lat: el.lat,
    lng: el.lon,
    entranceType: tags.entrance ?? tags.highway ?? 'yes',
    hasIntercom: tags.intercom === 'yes' || tags.buzzer === 'yes' || el.tags?.intercom != null,
    ref: tags.ref ?? tags['addr:unit'] ?? null,
    access: tags.access ?? 'yes',
  };
}

function polygonCentroid(geometry: Array<{ lat: number; lon: number }>): { lat: number; lng: number } {
  if (!geometry || !geometry.length) return { lat: 0, lng: 0 };
  const lat = geometry.reduce((s, n) => s + n.lat, 0) / geometry.length;
  const lng = geometry.reduce((s, n) => s + n.lon, 0) / geometry.length;
  return { lat, lng };
}

function parseBuildingWay(el: any, entrances: OsmEntranceNode[]): OsmBuildingData {
  const tags = el.tags ?? {};
  const geom: Array<{ lat: number; lon: number }> = el.geometry ?? [];
  const centroid = polygonCentroid(geom);

  const levels = tags['building:levels'] ?? tags['addr:levels'];
  const totalFloors = levels ? parseInt(levels, 10) : null;

  const underLevels = tags['building:levels:underground'];
  const undergroundFloors = underLevels ? parseInt(underLevels, 10) : null;

  // elevator tag: yes / no / dedicated node nearby
  let hasElevator: boolean | null = null;
  if (tags.elevator === 'yes') hasElevator = true;
  else if (tags.elevator === 'no') hasElevator = false;
  // if neither, leave null — will be inferred

  const name = tags.name ?? tags['addr:housename'] ?? null;
  const buildingType = tags.building ?? 'yes';

  // Purpose-built indicator: apartments|residential tag + name OR levels > 4
  const likelyPurposeBuilt =
    ['apartments', 'residential'].includes(buildingType) ||
    (totalFloors != null && totalFloors >= 4);

  return {
    osmId: el.id,
    osmType: 'way',
    buildingType,
    totalFloors,
    undergroundFloors,
    hasElevator,
    hasStairlift: tags.stairlift === 'yes',
    name,
    operator: tags.operator ?? tags['operated_by'] ?? null,
    entrances,
    centroidLat: centroid.lat,
    centroidLng: centroid.lng,
    likelyPurposeBuilt,
    startDate: tags.start_date ?? tags['construction:start_date'] ?? null,
  };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Fetch building polygon data and entrance nodes for a given lat/lng.
 * Returns null if no building is found within the search radius.
 *
 * @example
 * const building = await getBuildingContext(51.5074, -0.1278);
 * // building.totalFloors     → 8
 * // building.hasElevator     → true
 * // building.entrances[0]    → { lat, lng, entranceType: 'main', hasIntercom: true }
 */
export async function getBuildingContext(
  lat: number,
  lng: number,
  radiusM = 80,
): Promise<OsmBuildingData | null> {
  const query = buildBuildingQuery(lat, lng, radiusM);
  const data = await fetchOverpass(query);

  // Separate nodes (entrances, intercoms, elevators) from ways (buildings)
  const entranceNodes: OsmEntranceNode[] = [];
  const elevatorNodePresent: boolean = data.elements.some(
    (el: any) =>
      el.type === 'node' &&
      (el.tags?.elevator === 'yes' || el.tags?.highway === 'elevator'),
  );

  for (const el of data.elements) {
    if (el.type === 'node') {
      const tags = el.tags ?? {};
      // Entrance nodes
      if (tags.entrance || tags.intercom || tags.buzzer) {
        entranceNodes.push(parseEntranceNode(el));
      }
    }
  }

  // Sort entrances: main first, then service, then others
  entranceNodes.sort((a, b) => {
    const priority = (t: string) =>
      t === 'main' ? 0 : t === 'service' ? 1 : t === 'staircase' ? 2 : 3;
    return priority(a.entranceType) - priority(b.entranceType);
  });

  // Find best building way (closest centroid to query point)
  const buildingWays = data.elements.filter(
    (el: any) => el.type === 'way' && el.tags?.building,
  );

  if (!buildingWays.length) return null;

  // Pick the building way whose centroid is closest to the query point
  let bestWay = buildingWays[0];
  let bestDist = Infinity;
  for (const way of buildingWays) {
    const c = polygonCentroid(way.geometry ?? []);
    const d = haversineM(lat, lng, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      bestWay = way;
    }
  }

  const building = parseBuildingWay(bestWay, entranceNodes);

  // If an elevator node was found nearby but building way has no elevator tag, mark it
  if (building.hasElevator === null && elevatorNodePresent) {
    building.hasElevator = true;
  }

  return building;
}

/**
 * Batch version — fetch building context for multiple properties.
 * Runs concurrently with a concurrency cap to avoid hammering Overpass.
 */
export async function getBuildingContextBatch(
  points: Array<{ id: string; lat: number; lng: number }>,
  concurrency = 5,
): Promise<Map<string, OsmBuildingData | null>> {
  const results = new Map<string, OsmBuildingData | null>();
  const queue = [...points];

  async function worker() {
    while (queue.length) {
      const point = queue.shift();
      if (!point) break;
      try {
        const ctx = await getBuildingContext(point.lat, point.lng);
        results.set(point.id, ctx);
      } catch {
        results.set(point.id, null);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
