/**
 * Route Optimizer — Public API
 * Re-exports key types and the optimise function.
 */

export type { StopPoint, SequencerInput, SequencerOutput, SweepZone, LatLng } from '../route-engine/src/types.js';

export type DriveHandedness = 'left' | 'right'; // UK = left

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Simple Haversine distance in km */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Nearest-neighbour TSP heuristic — good enough for < 300 stops */
export function optimiseNearestNeighbour(
  stops: Array<{ id: string; lat: number; lng: number }>,
  depot: GeoPoint,
): typeof stops {
  if (stops.length === 0) return [];

  const remaining = [...stops];
  const ordered: typeof stops = [];
  let current: GeoPoint = depot;

  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    const next = remaining.splice(nearest, 1)[0];
    ordered.push(next);
    current = next;
  }

  return ordered;
}
