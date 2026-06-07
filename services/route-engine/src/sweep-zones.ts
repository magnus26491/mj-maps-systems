/**
 * Sweep Zone Builder
 * Groups stops into geographic zones to prevent backtracking.
 * Uses a simple grid-cell bucketing approach (fast, O(n)).
 */

import type { StopPoint, SweepZone, LatLng } from './types';

/** Grid cell size in degrees (~1-2 km depending on latitude) */
const CELL_DEG = 0.015;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
}

function centroid(latlngs: LatLng[]): LatLng {
  const lat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
  const lng = latlngs.reduce((s, p) => s + p.lng, 0) / latlngs.length;
  return { lat, lng };
}

function radiusKm(points: LatLng[], center: LatLng): number {
  let maxDeg = 0;
  for (const p of points) {
    const d = Math.sqrt((p.lat - center.lat) ** 2 + (p.lng - center.lng) ** 2);
    if (d > maxDeg) maxDeg = d;
  }
  return maxDeg * 111; // 1 degree ≈ 111 km
}

export function buildSweepZones(stops: StopPoint[]): SweepZone[] {
  const cells = new Map<string, StopPoint[]>();

  for (const stop of stops) {
    const lat = stop.pin?.lat ?? stop.lat;
    const lng = stop.pin?.lng ?? stop.lng;
    const key = cellKey(lat, lng);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(stop);
  }

  const zones: SweepZone[] = [];
  let zoneIdx = 0;

  cells.forEach((cellStops) => {
    if (cellStops.length === 0) return;

    const points: LatLng[] = cellStops.map(s => ({
      lat: s.pin?.lat ?? s.lat,
      lng: s.pin?.lng ?? s.lng,
    }));
    const c = centroid(points);
    const rKm = radiusKm(points, c);

    zones.push({
      id: `zone-${zoneIdx++}`,
      stopIds: cellStops.map(s => s.id),
      centroidLat: c.lat,
      centroidLng: c.lng,
      radiusKm: rKm,
      centroid: c,
      radiusM: rKm * 1000,
    });
  });

  return zones;
}

/**
 * Anti-backtrack penalty — returns a penalty multiplier (1.0 = no penalty)
 * for a proposed stop sequence. Higher = worse.
 */
export function antiBacktrackPenalty(stops: StopPoint[]): number {
  if (stops.length < 3) return 1.0;

  let backtrackCount = 0;

  for (let i = 1; i < stops.length - 1; i++) {
    const prev = stops[i - 1];
    const curr = stops[i];
    const next = stops[i + 1];

    const prevLat = prev.pin?.lat ?? prev.lat;
    const prevLng = prev.pin?.lng ?? prev.lng;
    const currLat = curr.pin?.lat ?? curr.lat;
    const currLng = curr.pin?.lng ?? curr.lng;
    const nextLat = next.pin?.lat ?? next.lat;
    const nextLng = next.pin?.lng ?? next.lng;

    // Dot product of vectors prev→curr and curr→next
    // Negative dot = sharp reversal = backtrack
    const v1lat = currLat - prevLat;
    const v1lng = currLng - prevLng;
    const v2lat = nextLat - currLat;
    const v2lng = nextLng - currLng;
    const dot = v1lat * v2lat + v1lng * v2lng;

    if (dot < 0) backtrackCount++;
  }

  return 1.0 + (backtrackCount / stops.length) * 0.5;
}
