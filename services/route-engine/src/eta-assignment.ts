/**
 * Route Engine — ETA assignment pass
 *
 * After stop order is determined, this pass walks the sequence and
 * assigns planned ETAs to every stop.
 *
 * Travel time model:
 *   distance (haversine) → road speed estimate → add dwell → cascade
 *
 * Road speed is estimated from distance bucket (crude but sufficient
 * for planning time; replaced by live traffic data mid-shift):
 *   < 500m   → 15 kph  (walking/very short urban hop)
 *   500–2km  → 25 kph  (urban)
 *   2–10km   → 45 kph  (suburban / A-road)
 *   > 10km   → 65 kph  (rural / dual carriageway)
 *
 * Time-window violations are flagged but do not reorder stops
 * (that would require full VRPTW — Phase 2 scope).
 */

import { haversineM } from './geo';
import type { Stop, RouteConstraints } from './types';

function speedKph(distM: number): number {
  if (distM < 500)   return 15;
  if (distM < 2000)  return 25;
  if (distM < 10000) return 45;
  return 65;
}

export interface EtaAssignmentResult {
  stops:              Stop[];
  totalDistanceM:     number;
  totalDurationSec:   number;
  timeWindowViolations: Array<{ stopId: string; type: 'EARLY' | 'LATE'; deltaMin: number }>;
}

export function assignEtas(
  orderedStops: Stop[],
  constraints:  RouteConstraints,
): EtaAssignmentResult {
  const stops:    Stop[]   = [];
  const violations: EtaAssignmentResult['timeWindowViolations'] = [];

  let curLat  = constraints.depotLat;
  let curLng  = constraints.depotLng;
  let curTime = constraints.shiftStartMs;
  let totalDistM = 0;

  for (const stop of orderedStops) {
    const distM      = haversineM(curLat, curLng, stop.pin.lat, stop.pin.lng);
    const travelSec  = (distM / 1000) / speedKph(distM) * 3600;
    const eta        = curTime + travelSec * 1000;

    totalDistM += distM;

    // Check time window
    if (stop.timeWindow) {
      if (stop.timeWindow.earliest && eta < stop.timeWindow.earliest) {
        violations.push({
          stopId:   stop.id,
          type:     'EARLY',
          deltaMin: Math.round((stop.timeWindow.earliest - eta) / 60000),
        });
      }
      if (stop.timeWindow.latest && eta > stop.timeWindow.latest) {
        violations.push({
          stopId:   stop.id,
          type:     'LATE',
          deltaMin: Math.round((eta - stop.timeWindow.latest) / 60000),
        });
      }
    }

    stops.push({ ...stop, eta });

    curLat  = stop.pin.lat;
    curLng  = stop.pin.lng;
    curTime = eta + stop.dwellSeconds * 1000;
  }

  const totalDurationSec = (curTime - constraints.shiftStartMs) / 1000;

  return { stops, totalDistanceM: totalDistM, totalDurationSec, timeWindowViolations: violations };
}
