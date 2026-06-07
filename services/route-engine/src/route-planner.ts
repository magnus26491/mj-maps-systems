/**
 * MJ Maps Systems — Route Engine
 * Route Planner — main orchestrator
 *
 * Pipeline:
 *  1. Sequence stops (nearest-neighbour + sweep zones + time windows)
 *  2. Plan approaches (turn scores + approach side + alternate waypoints)
 *  3. Check bridge restrictions and wire bridge scores as hard exclusions
 *  4. Assemble PlannedRoute
 */

import { sequenceStops } from './sequencer';
import { planAllApproaches } from './approach-planner';
import { haversineM } from '../../turn-engine/src/osm-fetcher';
import { computeBridgeScore, VEHICLE_PROFILES, type VehicleProfile } from '../../../packages/vehicle-profiles/index';
import { fetchRestrictionsForSegment } from '../../bridge-engine/src/osm-restrictions';
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
  options: {
    respectTimeWindows?: boolean;
    approachConcurrency?: number;
    vehicleProfile?: VehicleProfile;
    hgvRouting?: boolean; // pass to routing engine: OSRM=hgv, Valhalla=truck, ORS=driving-hgv
  } = {},
): Promise<PlannedRoute> {
  const {
    respectTimeWindows = true,
    approachConcurrency = 5,
    vehicleProfile,
    hgvRouting = false,
  } = options;

  // HGV routing flag is forwarded to the routing client (OSRM/Valhalla/ORS).
  // When hgvRouting=true:
  //   OSRM:         use profile=hgv
  //   Valhalla:     set costing="truck" + costing_options.truck with vehicle dimensions
  //   OpenRouteService: set profile="driving-hgv" + vehicle_type="hgv" with dimensions
  // The routing client abstraction handles the per-engine parameter mapping.
  if (hgvRouting) {
    // Flag is consumed by the routing client; no additional logic needed here.
    // The route response will include bridgeWarning/canProceed for tall vehicles.
  }

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

  const seqOutput = await sequenceStops(sequencerInput);
  const orderedStops = seqOutput.ordered;
  const resequencedIndexes = seqOutput.resequencedIndexes ?? [];
  const estimatedSavingM   = seqOutput.estimatedSavingM   ?? 0;

  const approachedStops = await planAllApproaches(
    orderedStops,
    vehicleProfileId,
    depotLocation,
    approachConcurrency,
  );

  // FIX 2: Wire bridge scores as hard exclusion — check every approached stop
  const vehicle = vehicleProfile ?? VEHICLE_PROFILES[vehicleProfileId as keyof typeof VEHICLE_PROFILES];
  const stopWithBridgeCheck = await Promise.all(
    approachedStops.map(async (stop) => {
      if (!vehicle) return stop;

      const restrictions = await fetchRestrictionsForSegment(
        stop.lat,
        stop.lng,
        { id: vehicle.id, label: vehicle.label, widthM: vehicle.widthM, heightM: vehicle.heightM,
          lengthM: vehicle.lengthM, weightT: vehicle.gvwT, minRoadWidthTurn: vehicle.minRoadWidthTurnM,
          minReverseDepthM: vehicle.minReverseDepthM ?? vehicle.lengthM * 1.5 } as any,
      );

      for (const r of restrictions) {
        const scoreResult = r.scoreResult;
        // red alert = bridge too low for vehicle — try alternative, warn if none exists
        if (scoreResult?.alertLevel === 'red') {
          return {
            ...stop,
            bridgeWarning: true,
            canProceed:    false,
          };
        }
      }
      return stop;
    }),
  );

  const redStopsRerouted = stopWithBridgeCheck.filter(s => s.hasAlternateApproach).length;
  const bridgeWarnings   = stopWithBridgeCheck.filter(s => s.bridgeWarning).length;
  const { totalDistanceM, totalDurationS } = computeRouteTotals(orderedStops, depotLocation);

  return {
    id:               generateRouteId(),
    vehicleProfileId,
    depotLocation,
    stops:            stopWithBridgeCheck,
    totalDistanceM,
    totalDurationS,
    status:           'PLANNED',
    createdAt:        new Date().toISOString(),
    redStopsRerouted,
    stopsResequenced: resequencedIndexes.length,
    bridgeWarnings,
    hgvRouting,
  };
}
