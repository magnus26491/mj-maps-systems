/**
 * MJ Maps Systems — OSM Road Query
 *
 * Fetches RoadApproach data for a given coordinate:
 *  - Road width (kerb-to-kerb metres)
 *  - Road class (residential / service / unclassified / tertiary / secondary / primary)
 *  - Dead-end / cul-de-sac detection
 *  - Turning head / turning circle presence
 *  - One-way restriction
 *  - Max vehicle weight restriction (tonnes)
 *  - Max vehicle height restriction (metres)
 *  - OSM way ID for cache keying
 *
 * Used by: services/property-engine/stop-intelligence.ts
 */

import { runOverpassQuery } from './overpass-client';
import type { RoadApproach } from '../property-engine/stop-intelligence';

// ─── QUERY ───────────────────────────────────────────────────────────────────

function buildRoadQuery(lat: number, lng: number, radiusM = 30): string {
  return `
[out:json][timeout:12];
(
  // Driveable ways within radius
  way["highway"~"^(residential|service|unclassified|tertiary|secondary|primary|living_street|track)$"](around:${radiusM},${lat},${lng});

  // Turning circles / turning heads near the stop
  node["highway"="turning_circle"](around:60,${lat},${lng});
  node["highway"="turning_loop"](around:60,${lat},${lng});
  node["junction"="roundabout"](around:60,${lat},${lng});
);
out body geom;
  `.trim();
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

/**
 * Estimate road width in metres from OSM tags.
 * Priority: width tag → lanes tag → highway class default.
 */
function estimateRoadWidth(tags: Record<string, string>): number | null {
  if (tags.width) {
    const w = parseFloat(tags.width);
    if (!isNaN(w) && w > 0) return w;
  }
  if (tags['lanes']) {
    const lanes = parseInt(tags['lanes'], 10);
    if (!isNaN(lanes)) return lanes * 3.2; // ~3.2m per lane UK standard
  }
  // Highway class defaults (UK typical kerb-to-kerb)
  const defaults: Record<string, number> = {
    primary:        9.0,
    secondary:      7.3,
    tertiary:       6.5,
    unclassified:   5.5,
    residential:    5.0,
    living_street:  4.5,
    service:        4.0,
    track:          3.5,
  };
  return defaults[tags.highway] ?? null;
}

function parseMaxWeight(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseMaxHeight(val: string | undefined): number | null {
  if (!val) return null;
  // Handle formats: "2.5", "2.5 m", "8'2"
  if (val.includes("'")) {
    const parts = val.split("'");
    const feet = parseFloat(parts[0]);
    const inches = parseFloat(parts[1] ?? '0');
    return isNaN(feet) ? null : Math.round((feet * 0.3048 + inches * 0.0254) * 100) / 100;
  }
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Detect dead-end: a way whose start or end node has degree 1
 * (connected to only one other way). We approximate this from
 * the Overpass response by checking if the way geometry ends
 * at the query point with no other ways sharing that node.
 *
 * Simple heuristic: if the way has highway=service + service=driveway
 * or name contains "close"/"cul" it is likely a dead-end.
 */
function detectDeadEnd(tags: Record<string, string>, wayCount: number): boolean {
  if (tags.service === 'driveway') return true;
  const name = (tags.name ?? '').toLowerCase();
  if (name.includes('close') || name.includes('cul') || name.includes('dead end')) return true;
  if (tags['noexit'] === 'yes') return true;
  // If only one driveable way was found within 30m, likely a dead-end spur
  if (wayCount === 1 && tags.highway === 'service') return true;
  return false;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Fetch road approach data for a stop coordinate.
 * Returns null if no driveable road is found within the search radius.
 *
 * @example
 * const road = await getRoadApproach(51.5074, -0.1278);
 * // road.roadWidthM      → 5.0
 * // road.isDeadEnd       → false
 * // road.hasTurningHead  → false
 * // road.maxWeightT      → null  (no restriction)
 * // road.maxHeightM      → null
 */
export async function getRoadApproach(
  lat: number,
  lng: number,
  radiusM = 30,
): Promise<RoadApproach | null> {
  const query = buildRoadQuery(lat, lng, radiusM);
  const data  = await runOverpassQuery(query);

  const ways  = data.elements.filter((el: any) => el.type === 'way' && el.tags?.highway);
  const turningNodes = data.elements.filter(
    (el: any) => el.type === 'node' && (
      el.tags?.highway === 'turning_circle' ||
      el.tags?.highway === 'turning_loop'
    )
  );

  if (!ways.length) return null;

  // Pick the primary way: prefer residential/service over primary/secondary
  // (we want the last-mile road, not the arterial 30m away)
  const priority = ['living_street','service','residential','unclassified','track','tertiary','secondary','primary'];
  ways.sort((a: any, b: any) => {
    const pa = priority.indexOf(a.tags?.highway ?? '');
    const pb = priority.indexOf(b.tags?.highway ?? '');
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  const way = ways[0];
  const tags = way.tags ?? {};

  const roadWidthM     = estimateRoadWidth(tags);
  const isOneWay       = tags.oneway === 'yes' || tags.oneway === '1';
  const hasTurningHead = turningNodes.length > 0;
  const isDeadEnd      = detectDeadEnd(tags, ways.length);
  const maxWeightT     = parseMaxWeight(tags['maxweight']);
  const maxHeightM     = parseMaxHeight(tags['maxheight']);

  return {
    osmWayId:      way.id,
    roadWidthM,
    roadClass:     tags.highway ?? null,
    isDeadEnd,
    hasTurningHead,
    isOneWay,
    maxWeightT,
    maxHeightM,
  };
}

/**
 * Batch fetch road approach data for multiple stops.
 * Concurrency-capped to avoid Overpass rate limits.
 */
export async function getRoadApproachBatch(
  points: Array<{ id: string; lat: number; lng: number }>,
  concurrency = 6,
): Promise<Map<string, RoadApproach | null>> {
  const results = new Map<string, RoadApproach | null>();
  const queue   = [...points];

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      try {
        results.set(p.id, await getRoadApproach(p.lat, p.lng));
      } catch {
        results.set(p.id, null);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
