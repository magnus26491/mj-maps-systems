// ─────────────────────────────────────────────────────────────────────────────
// OSM Road Geometry Service
// Fetches real road width, restrictions, and geometry data from Overpass API
// then enriches RoadGeometry objects for the turn-engine.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';
import type { RoadGeometry } from '../../../packages/vehicle-profiles/index';

const app = Fastify({ logger: true });

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

// Map OSM highway tags → estimated default road widths (kerb-to-kerb, metres)
const HIGHWAY_DEFAULT_WIDTHS: Record<string, number> = {
  motorway: 14.0,
  trunk: 11.0,
  primary: 8.5,
  secondary: 7.5,
  tertiary: 6.5,
  unclassified: 5.5,
  residential: 5.0,
  service: 4.0,
  track: 3.5,
  path: 2.0,
  private: 3.5,
};

interface OsmWayTags {
  highway?: string;
  width?: string;
  maxheight?: string;
  maxweight?: string;
  'maxweight:hgv'?: string;
  oneway?: string;
  access?: string;
  surface?: string;
}

interface OsmElement {
  type: 'way' | 'node';
  id: number;
  tags?: OsmWayTags;
  nodes?: number[];
}

interface OsmResponse {
  elements: OsmElement[];
}

/**
 * Query Overpass for road ways within radius of a lat/lon point.
 * Returns the nearest matching way enriched as RoadGeometry.
 */
async function fetchRoadGeometry(
  lat: number,
  lon: number,
  radiusM: number = 30,
): Promise<RoadGeometry> {
  const query = `
    [out:json][timeout:10];
    way(around:${radiusM},${lat},${lon})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|path)$"];
    out tags;
  `;

  let osmData: OsmResponse;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12_000),
    });
    osmData = (await res.json()) as OsmResponse;
  } catch (err) {
    // Fallback: return conservative defaults when OSM is unreachable
    return buildFallback();
  }

  const ways = osmData.elements.filter((e) => e.type === 'way' && e.tags?.highway);
  if (ways.length === 0) return buildFallback();

  // Take the first (nearest) way
  const tags = ways[0].tags ?? {};
  const highwayClass = (tags.highway ?? 'unclassified') as RoadGeometry['highwayClass'];

  // Parse width
  let roadWidthM = HIGHWAY_DEFAULT_WIDTHS[highwayClass] ?? 5.0;
  if (tags.width) {
    const parsed = parseFloat(tags.width);
    if (!isNaN(parsed)) roadWidthM = parsed;
  }

  // Parse height restriction
  let heightRestrictionM: number | undefined;
  if (tags.maxheight) {
    const h = parseFloat(tags.maxheight);
    if (!isNaN(h)) heightRestrictionM = h;
  }

  // Parse weight limit
  let weightLimitT: number | undefined;
  if (tags.maxweight) {
    const w = parseFloat(tags.maxweight);
    if (!isNaN(w)) weightLimitT = w;
  } else if (tags['maxweight:hgv']) {
    const w = parseFloat(tags['maxweight:hgv']);
    if (!isNaN(w)) weightLimitT = w;
  }

  return {
    roadWidthM,
    turningHeadDiamM: 0,       // enriched separately by property-engine
    distanceToDeadEndM: 999,   // enriched separately by route-engine dead-end pass
    isDeadEnd: false,
    highwayClass,
    heightRestrictionM,
    weightLimitT,
  };
}

function buildFallback(): RoadGeometry {
  return {
    roadWidthM: 4.5,
    turningHeadDiamM: 0,
    distanceToDeadEndM: 999,
    isDeadEnd: false,
    highwayClass: 'unclassified',
  };
}

// HTTP endpoints
app.get<{ Querystring: { lat: string; lon: string; radius?: string } }>(
  '/osm/road',
  async (req, reply) => {
    const { lat, lon, radius } = req.query;
    const result = await fetchRoadGeometry(
      parseFloat(lat),
      parseFloat(lon),
      radius ? parseFloat(radius) : 30,
    );
    return reply.send(result);
  },
);

app.get('/health', async () => ({ status: 'ok', service: 'osm' }));

const PORT = Number(process.env.PORT ?? 3007);
app.listen({ port: PORT, host: '0.0.0.0' });

export { fetchRoadGeometry };
