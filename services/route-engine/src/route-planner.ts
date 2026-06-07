/**
 * MJ Maps Systems — Route Engine
 * Route Planner — main orchestrator
 *
 * Pipeline:
 *  1. Sequence stops (nearest-neighbour + sweep zones + time windows)
 *  2. Plan approaches (turn scores + approach side + alternate waypoints)
 *  3. Assemble PlannedRoute
 */

import { sequenceStops } from './sequencer';
import { planAllApproaches } from './approach-planner';
import { haversineM } from '../../turn-engine/src/osm-fetcher';
import type { StopPoint, PlannedRoute, SequencerInput, LatLng } from './types';

const AVG_SPEED_MS    = 20_000 / 3600; // 20 km/h in m/s
const DEFAULT_DWELL_S = 120;

let routeIdCounter = 0;
function generateRouteId(): string {
  return `route-${Date.now()}-${++routeIdCounter}`;
}

function computeRouteTotals(
  stops: StopPoint[],
  depot: LatLng,
): { totalDistanceM: number; totalDurationS: number } {
  if (stops.length === 0) return { totalDistanceM: 0, totalDurationS: 0 };

  let totalDistanceM = haversineM(
    { lat: depot.lat, lon: depot.lng },
    { lat: stops[0].lat, lon: stops[0].lng },
  );

  for (let i = 0; i < stops.length - 1; i++) {
    totalDistanceM += haversineM(
      { lat: stops[i].lat,     lon: stops[i].lng },
      { lat: stops[i + 1].lat, lon: stops[i + 1].lng },
    );
  }

  const drivingS = totalDistanceM / AVG_SPEED_MS;
  const dwellS   = stops.reduce((s, stop) => {
    const d = stop.dwellTimeS ?? (stop.dwell_minutes ? stop.dwell_minutes * 60 : DEFAULT_DWELL_S);
    return s + (d > 0 ? d : DEFAULT_DWELL_S);
  }, 0);

  return { totalDistanceM, totalDurationS: Math.round(drivingS + dwellS) };
}

export async function planRoute(
  stops: StopPoint[],
  vehicleProfileId: string,
  depotLocation: LatLng,
  options: { respectTimeWindows?: boolean; approachConcurrency?: number } = {},
): Promise<PlannedRoute> {
  const { respectTimeWindows = true, approachConcurrency = 5 } = options;

  const sequencerInput: SequencerInput = {
    stops,
    depotLat:           depotLocation.lat,
    depotLng:           depotLocation.lng,
    vehicleId:          vehicleProfileId,
    vehicleProfileId,
    depotLocation,
    respectTimeWindows,
    shiftStartISO:      new Date().toISOString(),
  };

  const seqOutput = sequenceStops(sequencerInput);
  const orderedStops = seqOutput.ordered;
  const resequencedIndexes = seqOutput.resequencedIndexes ?? [];
  const estimatedSavingM   = seqOutput.estimatedSavingM   ?? 0;

  const approachedStops = await planAllApproaches(
    orderedStops,
    vehicleProfileId,
    depotLocation,
    approachConcurrency,
  );

  const redStopsRerouted = approachedStops.filter(s => s.hasAlternateApproach).length;
  const { totalDistanceM, totalDurationS } = computeRouteTotals(orderedStops, depotLocation);

  return {
    id:               generateRouteId(),
    vehicleProfileId,
    depotLocation,
    stops:            approachedStops,
    totalDistanceM,
    totalDurationS,
    status:           'PLANNED',
    createdAt:        new Date().toISOString(),
    redStopsRerouted,
    stopsResequenced: resequencedIndexes.length,
  };
}
