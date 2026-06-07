/**
 * OSM Client — public re-export shim
 * All consumers should use this import path.
 * Underlying implementation is in services/osm/overpass-client.ts
 */

export {
  runOverpassQuery,
  getRoadContext,
  getRoadContextBatch,
  checkOverpassHealth,
  OVERPASS_ENDPOINTS,
} from '../osm/overpass-client';
export type { OsmRoadContext } from '../osm/overpass-client';

export interface OsmWay {
  id: number;
  type: 'way';
  tags: Record<string, string>;
  nodes: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OsmNode {
  id: number;
  type: 'node';
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export type OsmElement = OsmWay | OsmNode;

// ── Legacy shims consumed by turn-engine/index.ts and cache/index.ts ─────────

export type { OsmRoadSegment as RoadSegment } from '../turn-engine/src/types';

import { getRoadContext } from '../osm/overpass-client';
import type { OsmRoadSegment } from '../turn-engine/src/types';

/**
 * Fetch all road segments within radiusM of a point (legacy API).
 * Maps the modern OsmRoadContext shape back to the OsmRoadSegment shape
 * that turn-engine/index.ts and cache/index.ts expect.
 */
export async function fetchRoadsNear(
  lat: number,
  lng: number,
  _radiusM = 50,
): Promise<OsmRoadSegment[]> {
  const ctx = await getRoadContext(lat, lng);
  if (!ctx.road) return [];
  return [{
    wayId:          ctx.road.osmId,
    tags: {
      highway:   ctx.road.highway,
      ...(ctx.road.maxHeightM != null ? { maxheight: String(ctx.road.maxHeightM) } : {}),
      ...(ctx.road.maxWeightT != null ? { maxweight: String(ctx.road.maxWeightT) } : {}),
      ...(ctx.road.oneway     ? { oneway: 'yes' }             : {}),
      ...(ctx.road.access     ? { access: ctx.road.access }   : {}),
    },
    widthM:         ctx.road.widthM,
    maxHeightM:     ctx.road.maxHeightM,
    maxWeightT:     ctx.road.maxWeightT,
    hasTurningHead: ctx.road.hasTurningHead,
    isDeadEnd:      ctx.road.isDeadEnd,
    lengthToEndM:   ctx.road.lengthToEndM,
    confidence:     'MEDIUM' as const,
    lastEdited:     null,
  }];
}

/**
 * Return the single best-matching road segment at a point (legacy API).
 */
export async function getBestRoadSegment(
  lat: number,
  lng: number,
): Promise<OsmRoadSegment | null> {
  const segments = await fetchRoadsNear(lat, lng);
  return segments[0] ?? null;
}
