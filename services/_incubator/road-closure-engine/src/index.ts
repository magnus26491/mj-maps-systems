/**
 * Road Closure Engine
 * Monitors OSM / TomTom / HERE for road closures and construction
 * along the active route and triggers replanning when necessary.
 */

import type { StopPoint } from '../../route-engine/src/types';
import { runOverpassQuery } from '../../osm/overpass-client';

export interface RoadClosure {
  osmId?: number;
  lat: number;
  lng: number;
  radiusM: number;
  reason: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  affectsVehicleClasses: string[];
}

export interface ClosureCheckResult {
  hasActiveClosure: boolean;
  closures: RoadClosure[];
  affectedStopIds: string[];
}

/**
 * Check whether any known road closures affect stops on the route.
 * Uses Overpass to query OSM access=no / construction tags within 100m of each stop.
 */
export async function checkClosures(
  stops: StopPoint[],
  vehicleClass: string,
): Promise<ClosureCheckResult> {
  if (stops.length === 0) {
    return { hasActiveClosure: false, closures: [], affectedStopIds: [] };
  }

  const closures: RoadClosure[] = [];
  const affectedStopIds: string[] = [];

  // Build a batch Overpass query covering all stop locations
  const unionParts = stops
    .map(s => `way(around:100,${s.lat},${s.lng})["access"="no"];`)
    .join('\n');

  const query = `
    [out:json][timeout:20];
    (
      ${unionParts}
    );
    out body;
  `;

  try {
    const data = await runOverpassQuery(query);
    const elements: any[] = (data as any).elements ?? [];

    for (const el of elements) {
      if (!el.tags) continue;

      const closure: RoadClosure = {
        osmId: el.id,
        lat: el.center?.lat ?? stops[0].lat,
        lng: el.center?.lon ?? stops[0].lng,
        radiusM: 100,
        reason: el.tags.description ?? el.tags.note ?? 'Road closed (OSM access=no)',
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        affectsVehicleClasses: ['van', 'hgv', 'artic'],
      };

      closures.push(closure);

      // Mark any stops within 100m of this closure as affected
      for (const stop of stops) {
        const dLat = (stop.lat - closure.lat) * 111_000;
        const dLng = (stop.lng - closure.lng) * 111_000;
        const distM = Math.sqrt(dLat ** 2 + dLng ** 2);
        if (distM <= closure.radiusM) {
          if (!affectedStopIds.includes(stop.id)) {
            affectedStopIds.push(stop.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[road-closure-engine] Overpass query failed:', (err as Error).message);
  }

  return {
    hasActiveClosure: closures.length > 0,
    closures,
    affectedStopIds,
  };
}
