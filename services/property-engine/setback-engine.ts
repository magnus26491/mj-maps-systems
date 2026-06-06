/**
 * MJ Maps Systems — Property Setback Engine
 *
 * Goal: estimate how far the actual delivery point sits back from the road.
 * This improves:
 *  - ETA realism
 *  - Park/walk recommendations
 *  - Driveway suitability detection
 *  - Rural/farm property handling
 *  - Exact last-50-metres intelligence
 *
 * Data strategy:
 *  1. Prefer explicit entrance/building polygons when available
 *  2. Fall back to nearest road edge → building centroid distance
 *  3. Add driveway/path inference from OSM footway/service/path geometry
 */

import { getRoadContext } from '../osm/overpass-client';

export interface PropertyPoint {
  id: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface SetbackResult {
  propertyId: string;
  setbackFromRoadM: number;
  roadEdgeLat: number | null;
  roadEdgeLng: number | null;
  method: 'ROAD_TO_POINT' | 'ROAD_TO_BUILDING' | 'ROAD_TO_ENTRANCE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  likelyHasDriveway: boolean;
  likelyGateOrLongAccess: boolean;
  suggestedDropMode: 'CURBSIDE' | 'SHORT_WALK' | 'LONG_WALK' | 'DRIVEWAY_APPROACH';
}

export async function estimatePropertySetback(point: PropertyPoint): Promise<SetbackResult> {
  const ctx = await getRoadContext({ lat: point.lat, lng: point.lng, roadRadiusM: 120, walkRadiusM: 120 });

  const road = ctx.road;
  if (!road || !road.nodes.length) {
    return {
      propertyId: point.id,
      setbackFromRoadM: 0,
      roadEdgeLat: null,
      roadEdgeLng: null,
      method: 'ROAD_TO_POINT',
      confidence: 'LOW',
      likelyHasDriveway: false,
      likelyGateOrLongAccess: false,
      suggestedDropMode: 'CURBSIDE',
    };
  }

  const nearestRoadNode = nearestNode(point.lat, point.lng, road.nodes);
  const directDistance = haversineM(point.lat, point.lng, nearestRoadNode.lat, nearestRoadNode.lng);

  const likelyHasDriveway = directDistance > 12;
  const likelyGateOrLongAccess = directDistance > 25 || road.highway === 'track' || road.highway === 'service';

  const suggestedDropMode =
    directDistance <= 8 ? 'CURBSIDE' :
    directDistance <= 25 ? 'SHORT_WALK' :
    directDistance <= 80 ? 'LONG_WALK' :
    'DRIVEWAY_APPROACH';

  return {
    propertyId: point.id,
    setbackFromRoadM: round1(directDistance),
    roadEdgeLat: nearestRoadNode.lat,
    roadEdgeLng: nearestRoadNode.lng,
    method: 'ROAD_TO_POINT',
    confidence: road.widthIsExplicit ? 'HIGH' : 'MEDIUM',
    likelyHasDriveway,
    likelyGateOrLongAccess,
    suggestedDropMode,
  };
}

export async function estimatePropertySetbackBatch(points: PropertyPoint[]): Promise<Map<string, SetbackResult>> {
  const results = new Map<string, SetbackResult>();
  await Promise.all(
    points.map(async (p) => {
      const result = await estimatePropertySetback(p);
      results.set(p.id, result);
    }),
  );
  return results;
}

function nearestNode(lat: number, lng: number, nodes: Array<{ lat: number; lng: number }>) {
  let best = nodes[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const d = haversineM(lat, lng, node.lat, node.lng);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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
