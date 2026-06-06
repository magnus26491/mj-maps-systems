/**
 * Route Engine — 2-opt local search improvement
 *
 * After the sweep-zone pass produces an anti-backtrack initial sequence,
 * 2-opt removes crossing edges that inflate total distance.
 *
 * 2-opt rule: if reversing segment [i+1..k] reduces total distance, do it.
 *
 * Complexity: O(n²) per pass, typically converges in 3-8 passes for
 * delivery routes up to 200 stops. Capped at MAX_ITERATIONS for safety.
 *
 * Anti-backtrack preservation:
 *   Zone boundaries are treated as soft constraints — 2-opt is allowed
 *   to cross zone boundaries only if the saving exceeds ZONE_CROSS_PENALTY.
 *   This means the sweep structure is largely preserved while still
 *   removing obvious distance inefficiencies within zones.
 */

import { haversineM } from './geo';
import type { Stop } from './types';

const MAX_ITERATIONS    = 50;
const ZONE_CROSS_PENALTY = 500; // metres — cost added for crossing a zone boundary

function routeDistance(stops: Stop[]): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineM(
      stops[i].pin.lat, stops[i].pin.lng,
      stops[i + 1].pin.lat, stops[i + 1].pin.lng,
    );
  }
  return total;
}

function sameZone(a: Stop, b: Stop): boolean {
  // Stops are in the same zone if they were assigned adjacent sequence numbers
  // in the sweep pass — proxy: within 1.5km of each other
  return haversineM(a.pin.lat, a.pin.lng, b.pin.lat, b.pin.lng) < 1500;
}

export function twoOpt(stops: Stop[]): Stop[] {
  if (stops.length < 4) return stops;

  let best    = [...stops];
  let improved = true;
  let iterations = 0;

  while (improved && iterations < MAX_ITERATIONS) {
    improved = false;
    iterations++;

    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        // Current distance: i→i+1 and k→k+1
        const d1 = haversineM(
          best[i].pin.lat, best[i].pin.lng,
          best[i + 1 < best.length ? i + 1 : 0].pin.lat,
          best[i + 1 < best.length ? i + 1 : 0].pin.lng,
        );
        const d2 = k + 1 < best.length
          ? haversineM(best[k].pin.lat, best[k].pin.lng, best[k + 1].pin.lat, best[k + 1].pin.lng)
          : 0;

        // New distance: i→k and i+1→k+1
        const d3 = haversineM(
          best[i].pin.lat, best[i].pin.lng,
          best[k].pin.lat, best[k].pin.lng,
        );
        const d4 = k + 1 < best.length
          ? haversineM(best[i + 1].pin.lat, best[i + 1].pin.lng, best[k + 1].pin.lat, best[k + 1].pin.lng)
          : 0;

        let saving = (d1 + d2) - (d3 + d4);

        // Apply zone-cross penalty if this swap crosses zone boundaries
        if (!sameZone(best[i], best[k])) saving -= ZONE_CROSS_PENALTY;

        if (saving > 0) {
          // Reverse segment [i+1..k]
          const newRoute = [
            ...best.slice(0, i + 1),
            ...best.slice(i + 1, k + 1).reverse(),
            ...best.slice(k + 1),
          ];
          best     = newRoute;
          improved = true;
        }
      }
    }
  }

  // Re-assign sequence numbers
  return best.map((stop, idx) => ({ ...stop, sequence: idx + 1 }));
}
