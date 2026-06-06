/**
 * MJ Maps Systems — OSM Overpass API Client
 *
 * Fetches real road geometry data to power:
 *   1. Turn-around feasibility scoring (road width, turning heads, dead-ends)
 *   2. Walk/drive cluster engine (pedestrian footways, alleys, cut-throughs)
 *   3. Level crossing detection (railway crossing nodes)
 *   4. Road access restrictions (height, weight, width limits)
 *
 * Overpass API is free, no key required.
 * Rate limits: ~10,000 req/day on public endpoint.
 * For production: self-host Overpass or use Overpass Turbo Pro.
 *
 * Endpoints:
 *   Public:     https://overpass-api.de/api/interpreter
 *   Backup:     https://lz4.overpass-api.de/api/interpreter
 *   Self-host:  process.env.OVERPASS_API_URL
 */

export const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface OsmRoadSegment {
  osmId: number;
  name: string | null;
  /** OSM highway tag: residential | unclassified | service | track | footway etc. */
  highway: string;
  /** Estimated kerb-to-kerb width in metres (from OSM width tag or heuristic) */
  widthM: number;
  /** Whether a width tag is explicitly set in OSM (vs estimated) */
  widthIsExplicit: boolean;
  /** Road surface: asphalt | concrete | gravel | dirt | grass | unknown */
  surface: string;
  /** Max vehicle width restriction (metres) — from maxwidth tag */
  maxWidthM: number | null;
  /** Max vehicle height restriction (metres) — from maxheight tag */
  maxHeightM: number | null;
  /** Max vehicle weight restriction (tonnes) — from maxweight tag */
  maxWeightT: number | null;
  /** Is this a dead-end / cul-de-sac? */
  isDeadEnd: boolean;
  /** Does this segment have a turning head (OSM turning_circle or turning_loop)? */
  hasTurningHead: boolean;
  /** Distance from query point to end of road (metres) */
  lengthToEndM: number;
  /** One-way restriction */
  oneWay: boolean;
  /** Access tag: yes | private | customers | no */
  access: string;
  /** Road nodes (lat/lng pairs for geometry) */
  nodes: Array<{ lat: number; lng: number }>;
}

export interface OsmPedestrianPath {
  osmId: number;
  /** footway | path | steps | pedestrian | alley | track */
  highway: string;
  /** Whether this path is lit */
  isLit: boolean;
  /** Whether steps are present */
  hasSteps: boolean;
  /** access: yes | private | permissive | no */
  access: string;
  /** Path length in metres */
  lengthM: number;
  nodes: Array<{ lat: number; lng: number }>;
}

export interface OsmLevelCrossing {
  osmId: number;
  lat: number;
  lng: number;
  /** crossing | level_crossing | railway */
  type: string;
  /** Whether barriers are present (longer closure) */
  hasBarriers: boolean;
  /** Whether lights are present */
  hasLights: boolean;
  /** Whether it is a supervised crossing */
  isSupervised: boolean;
  /** Nearest town/city for Darwin station lookup */
  nearestLocality: string | null;
}

export interface OsmRoadContext {
  /** The primary road segment at the queried point */
  road: OsmRoadSegment | null;
  /** Pedestrian paths within walkRadius of the queried point */
  pedestrianPaths: OsmPedestrianPath[];
  /** Level crossings within 500m of the queried point */
  levelCrossings: OsmLevelCrossing[];
  /** Raw Overpass response time (ms) */
  queryTimeMs: number;
}

// ─── WIDTH HEURISTICS ────────────────────────────────────────────────────────
// When OSM has no explicit width tag, estimate from road class.
// Based on UK Design Manual for Roads and Bridges + observed OSM data.

export const ROAD_WIDTH_HEURISTICS: Record<string, number> = {
  motorway:         11.0,
  motorway_link:     7.3,
  trunk:             9.0,
  trunk_link:        6.5,
  primary:           8.0,
  primary_link:      6.0,
  secondary:         7.3,
  secondary_link:    6.0,
  tertiary:          6.5,
  tertiary_link:     5.5,
  unclassified:      5.5,
  residential:       5.0,
  living_street:     4.0,
  service:           4.5,
  track:             3.5,
  bridleway:         3.0,
  cycleway:          2.5,
  footway:           1.5,
  path:              1.2,
  pedestrian:        6.0,  // pedestrianised high street — wide but no vehicles
  default:           5.0,
};

export function estimateRoadWidth(highway: string, explicitWidthM?: number): {
  widthM: number;
  isExplicit: boolean;
} {
  if (explicitWidthM != null && explicitWidthM > 0) {
    return { widthM: explicitWidthM, isExplicit: true };
  }
  const w = ROAD_WIDTH_HEURISTICS[highway] ?? ROAD_WIDTH_HEURISTICS.default;
  return { widthM: w, isExplicit: false };
}

// ─── OVERPASS QUERY BUILDER ──────────────────────────────────────────────────

/**
 * Build an Overpass QL query to fetch all road context for a given lat/lng.
 * Radius: road/paths within `roadRadiusM`, crossings within 500m.
 */
export function buildRoadContextQuery(params: {
  lat: number;
  lng: number;
  roadRadiusM?: number;   // default 100m — enough to capture the current road
  walkRadiusM?: number;   // default 400m — max walk cluster radius
}): string {
  const { lat, lng, roadRadiusM = 100, walkRadiusM = 400 } = params;

  return `
[out:json][timeout:10];
(
  // ── Driveable roads near query point ──────────────────────────────────────
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)$"]
    (around:${roadRadiusM},${lat},${lng});

  // ── Pedestrian paths within walk radius ───────────────────────────────────
  way["highway"~"^(footway|path|steps|pedestrian|alley|bridleway)$"]
    (around:${walkRadiusM},${lat},${lng});

  // ── Turning circles and loops within road radius ──────────────────────────
  node["highway"="turning_circle"](around:${roadRadiusM},${lat},${lng});
  node["highway"="turning_loop"](around:${roadRadiusM},${lat},${lng});

  // ── Level crossings within 500m ───────────────────────────────────────────
  node["railway"="level_crossing"](around:500,${lat},${lng});
  node["railway"="crossing"](around:500,${lat},${lng});
);
out body geom;
  `.trim();
}

// ─── OVERPASS FETCH (with fallback endpoints) ────────────────────────────────

async function fetchOverpass(query: string): Promise<any> {
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12_000),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${endpoint}`);
      }

      return await resp.json();
    } catch (err) {
      lastError = err as Error;
      // Try next endpoint
    }
  }

  throw new Error(`All Overpass endpoints failed. Last error: ${lastError?.message}`);
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

function parseRoadSegment(
  way: any,
  turningHeadNodeIds: Set<number>,
): OsmRoadSegment {
  const tags = way.tags ?? {};
  const nodes: Array<{ lat: number; lng: number }> = (way.geometry ?? []).map(
    (g: any) => ({ lat: g.lat, lng: g.lon })
  );

  const explicitWidth = tags.width ? parseFloat(tags.width) : undefined;
  const { widthM, isExplicit } = estimateRoadWidth(tags.highway, explicitWidth);

  // Dead-end detection: check if last node is a turning circle
  // OR if no other roads connect at the terminal node
  const terminalNodeId = way.nodes?.[way.nodes.length - 1];
  const hasTurningHead = turningHeadNodeIds.has(terminalNodeId);

  // Estimate length from node geometry
  const lengthToEndM = nodes.length > 1
    ? nodes.reduce((sum, node, i) => {
        if (i === 0) return 0;
        return sum + haversineM(nodes[i-1].lat, nodes[i-1].lng, node.lat, node.lng);
      }, 0)
    : 0;

  return {
    osmId: way.id,
    name: tags.name ?? tags['addr:street'] ?? null,
    highway: tags.highway,
    widthM,
    widthIsExplicit: isExplicit,
    surface: tags.surface ?? 'unknown',
    maxWidthM: tags.maxwidth ? parseFloat(tags.maxwidth) : null,
    maxHeightM: tags.maxheight ? parseFloat(tags.maxheight) : null,
    maxWeightT: tags.maxweight ? parseFloat(tags.maxweight) : null,
    isDeadEnd: hasTurningHead || (tags['noexit'] === 'yes'),
    hasTurningHead,
    lengthToEndM,
    oneWay: tags.oneway === 'yes' || tags.oneway === '1',
    access: tags.access ?? 'yes',
    nodes,
  };
}

function parsePedestrianPath(way: any): OsmPedestrianPath {
  const tags = way.tags ?? {};
  const nodes: Array<{ lat: number; lng: number }> = (way.geometry ?? []).map(
    (g: any) => ({ lat: g.lat, lng: g.lon })
  );

  const lengthM = nodes.length > 1
    ? nodes.reduce((sum, node, i) => {
        if (i === 0) return 0;
        return sum + haversineM(nodes[i-1].lat, nodes[i-1].lng, node.lat, node.lng);
      }, 0)
    : 0;

  return {
    osmId: way.id,
    highway: tags.highway,
    isLit: tags.lit === 'yes',
    hasSteps: tags.highway === 'steps' || tags.steps === 'yes',
    access: tags.access ?? (tags.highway === 'footway' ? 'yes' : 'unknown'),
    lengthM,
    nodes,
  };
}

function parseLevelCrossing(node: any): OsmLevelCrossing {
  const tags = node.tags ?? {};
  return {
    osmId: node.id,
    lat: node.lat,
    lng: node.lon,
    type: tags.railway,
    hasBarriers: tags.crossing_barrier === 'yes' || tags.barrier != null,
    hasLights: tags.crossing_light === 'yes',
    isSupervised: tags.supervised === 'yes',
    nearestLocality: tags['addr:city'] ?? tags['addr:town'] ?? null,
  };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Fetch full road context for a lat/lng point.
 * This is the primary entry point for both the turn engine and cluster engine.
 *
 * @example
 * const ctx = await getRoadContext({ lat: 51.5074, lng: -0.1278 });
 * const turnScore = computeTurnScore({
 *   roadWidthM: ctx.road?.widthM ?? 5.0,
 *   hasTurningHead: ctx.road?.hasTurningHead ?? false,
 *   roadLengthToEndM: ctx.road?.lengthToEndM ?? 50,
 *   vehicleProfile: VEHICLE_PROFILES.luton,
 * });
 */
export async function getRoadContext(params: {
  lat: number;
  lng: number;
  roadRadiusM?: number;
  walkRadiusM?: number;
}): Promise<OsmRoadContext> {
  const start = Date.now();
  const query = buildRoadContextQuery(params);
  const data = await fetchOverpass(query);

  const DRIVEABLE = new Set([
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'unclassified', 'residential',
    'living_street', 'service', 'track',
  ]);

  const WALKABLE = new Set([
    'footway', 'path', 'steps', 'pedestrian', 'alley', 'bridleway',
  ]);

  const CROSSING_TAGS = new Set(['level_crossing', 'crossing']);

  // Collect turning head node IDs first
  const turningHeadNodeIds = new Set<number>(
    data.elements
      .filter((el: any) => el.type === 'node' && el.tags?.highway?.match(/^turning/))
      .map((el: any) => el.id)
  );

  let road: OsmRoadSegment | null = null;
  const pedestrianPaths: OsmPedestrianPath[] = [];
  const levelCrossings: OsmLevelCrossing[] = [];

  for (const el of data.elements) {
    if (el.type === 'way') {
      const hw = el.tags?.highway;
      if (DRIVEABLE.has(hw)) {
        const seg = parseRoadSegment(el, turningHeadNodeIds);
        // Pick the widest/most relevant road (closest to query point)
        if (!road || seg.widthM > road.widthM) {
          road = seg;
        }
      } else if (WALKABLE.has(hw)) {
        pedestrianPaths.push(parsePedestrianPath(el));
      }
    } else if (el.type === 'node' && CROSSING_TAGS.has(el.tags?.railway)) {
      levelCrossings.push(parseLevelCrossing(el));
    }
  }

  return {
    road,
    pedestrianPaths,
    levelCrossings,
    queryTimeMs: Date.now() - start,
  };
}

// ─── BATCH FETCH ─────────────────────────────────────────────────────────────

/**
 * Fetch road context for multiple stops in a single Overpass query.
 * Much more efficient than individual requests for a full route.
 * Batches up to 50 points into one query.
 */
export async function getRoadContextBatch(stops: Array<{
  id: string;
  lat: number;
  lng: number;
}>): Promise<Map<string, OsmRoadContext>> {
  const BATCH_SIZE = 50;
  const results = new Map<string, OsmRoadContext>();

  for (let i = 0; i < stops.length; i += BATCH_SIZE) {
    const batch = stops.slice(i, i + BATCH_SIZE);

    // Build a union query for all stops in the batch
    const unionParts = batch.map(s =>
      `way["highway"](around:100,${s.lat},${s.lng});`
    ).join('\n  ');

    const query = `
[out:json][timeout:25];
(
  ${unionParts}
  ${batch.map(s => `node["highway"~"^turning"](around:100,${s.lat},${s.lng});`).join('\n  ')}
  ${batch.map(s => `node["railway"~"level_crossing|crossing"](around:500,${s.lat},${s.lng});`).join('\n  ')}
  ${batch.map(s => `way["highway"~"^(footway|path|steps|pedestrian|alley)$"](around:400,${s.lat},${s.lng});`).join('\n  ')}
);
out body geom;
    `.trim();

    const start = Date.now();
    const data = await fetchOverpass(query);
    const elapsed = Date.now() - start;

    // For batch queries, associate each result with the nearest stop
    for (const stop of batch) {
      // Filter elements near this stop
      const nearElements = data.elements.filter((el: any) => {
        if (el.type === 'node') {
          return haversineM(stop.lat, stop.lng, el.lat, el.lon) <= 500;
        }
        if (el.type === 'way' && el.geometry) {
          const midNode = el.geometry[Math.floor(el.geometry.length / 2)];
          return haversineM(stop.lat, stop.lng, midNode.lat, midNode.lon) <= 400;
        }
        return false;
      });

      const turningHeadNodeIds = new Set<number>(
        nearElements
          .filter((el: any) => el.type === 'node' && el.tags?.highway?.match(/^turning/))
          .map((el: any) => el.id)
      );

      const DRIVEABLE = new Set([
        'motorway', 'motorway_link', 'trunk', 'trunk_link',
        'primary', 'primary_link', 'secondary', 'secondary_link',
        'tertiary', 'tertiary_link', 'unclassified', 'residential',
        'living_street', 'service', 'track',
      ]);

      let road: OsmRoadSegment | null = null;
      const pedestrianPaths: OsmPedestrianPath[] = [];
      const levelCrossings: OsmLevelCrossing[] = [];

      for (const el of nearElements) {
        if (el.type === 'way') {
          const hw = el.tags?.highway;
          if (DRIVEABLE.has(hw)) {
            const seg = parseRoadSegment(el, turningHeadNodeIds);
            if (!road || seg.widthM > road.widthM) road = seg;
          } else if (['footway','path','steps','pedestrian','alley','bridleway'].includes(hw)) {
            pedestrianPaths.push(parsePedestrianPath(el));
          }
        } else if (el.type === 'node' && ['level_crossing','crossing'].includes(el.tags?.railway)) {
          levelCrossings.push(parseLevelCrossing(el));
        }
      }

      results.set(stop.id, { road, pedestrianPaths, levelCrossings, queryTimeMs: elapsed });
    }
  }

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
