/**
 * MJ Maps Systems — Route Engine
 * Route Planner — main orchestrator
 *
 * Full pipeline:
 *  1. Sequence stops (nearest-neighbour + sweep zones + time windows)
 *  2. Plan approaches (turn scores + approach side + alternate waypoints)
 *  3. Assemble PlannedRoute with distance/duration estimates
 *
 * Duration estimates use UK urban delivery averages:
 *  - Average speed: 20 km/h (1200 m/min) for urban routes
 *  - Dwell time: from StopPoint.dwellTimeS (default 120s if 0)
 */

import { sequenceStops } from './sequencer';
import { planAllApproaches } from './approach-planner';
import { haversineM } from '../../turn-engine/src/osm-fetcher';
import type { StopPoint, PlannedRoute, SequencerInput, LatLng } from './types';

/** Average urban delivery speed in m/s (20 km/h) */
const AVG_SPEED_MS = 20_000 / 3600;

/** Default dwell time if StopPoint.dwellTimeS is 0 */
const DEFAULT_DWELL_S = 120;

let routeIdCounter = 0;
function generateRouteId(): string {
  return `route-${Date.now()}-${++routeIdCounter}`;
}

// ─── DISTANCE + DURATION ─────────────────────────────────────────────────────

function computeRouteTotals(
  stops: StopPoint[],
  depotLocation: LatLng,
): { totalDistanceM: number; totalDurationS: number } {
  if (stops.length === 0) return { totalDistanceM: 0, totalDurationS: 0 };

  let totalDistanceM = haversineM(
    { lat: depotLocation.lat, lon: depotLocation.lng },
    { lat: stops[0].location.lat, lon: stops[0].location.lng },
  );

  for (let i = 0; i < stops.length - 1; i++) {
    totalDistanceM += haversineM(
      { lat: stops[i].location.lat, lon: stops[i].location.lng },
      { lat: stops[i + 1].location.lat, lon: stops[i + 1].location.lng },
    );
  }

  const drivingS = totalDistanceM / AVG_SPEED_MS;
  const dwellS = stops.reduce((s, stop) => s + (stop.dwellTimeS > 0 ? stop.dwellTimeS : DEFAULT_DWELL_S), 0);

  return { totalDistanceM, totalDurationS: Math.round(drivingS + dwellS) };
}

// ─── MAIN PLANNER ────────────────────────────────────────────────────────────

export async function planRoute(
  stops: StopPoint[],
  vehicleProfileId: string,
  depotLocation: LatLng,
  options: { respectTimeWindows?: boolean; approachConcurrency?: number } = {},
): Promise<PlannedRoute> {
  const { respectTimeWindows = true, approachConcurrency = 5 } = options;

  // 1. Sequence
  const sequencerInput: SequencerInput = {
    stops,
    vehicleProfileId,
    depotLocation,
    respectTimeWindows,
  };

  const { orderedStops, resequencedIndexes, estimatedSavingM } = sequenceStops(sequencerInput);

  // 2. Plan approaches (turn scores + rerouting)
  const approachedStops = await planAllApproaches(
    orderedStops,
    vehicleProfileId,
    depotLocation,
    approachConcurrency,
  );

  // 3. Count RED reroutes
  const redStopsRerouted = approachedStops.filter(s => s.hasAlternateApproach).length;

  // 4. Compute totals
  const { totalDistanceM, totalDurationS } = computeRouteTotals(orderedStops, depotLocation);

  return {
    id: generateRouteId(),
    vehicleProfileId,
    depotLocation,
    stops: approachedStops,
    totalDistanceM,
    totalDurationS,
    status: 'PLANNED',
    createdAt: new Date().toISOString(),
    redStopsRerouted,
    stopsResequenced: resequencedIndexes.length,
  };
}
