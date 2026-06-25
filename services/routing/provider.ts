/**
 * Routing pipeline — orchestrates matrix → solve → maneuvers.
 *
 * When all three engine env vars are unset, each step falls back to
 * the TypeScript implementation and the result is identical to the
 * pre-Stage-2 route-engine output (with an added durationMs breakdown).
 */

import type {
  LatLng,
  VrpStop,
  VehicleConstraints,
  RoutingPipelineResult,
} from './types.js';
import { osrmClient } from './osrm-client.js';
import { orToolsClient } from './or-tools-client.js';
import { valhallaClient } from './valhalla-client.js';

export interface RoutePipelineInput {
  /** Depot + all stops in order [depot, stop0, stop1, ...] */
  depot: LatLng;
  stops: VrpStop[];
  vehicleConstraints: VehicleConstraints;
  shiftStartEpoch: number;
  /** Whether to fetch Valhalla maneuvers (default true when VALHALLA_URL is set) */
  includeManeuvers?: boolean;
  departAt?: Date;
  timeLimitMs?: number;
}

/**
 * Run the full routing pipeline:
 *   1. OSRM N×N matrix  (fallback: Haversine)
 *   2. OR-Tools VRP     (fallback: nearest-neighbour TS)
 *   3. Valhalla steps   (skipped when VALHALLA_URL unset)
 */
export async function runRoutingPipeline(
  input: RoutePipelineInput,
): Promise<RoutingPipelineResult> {
  const t0 = Date.now();

  // All N+1 coordinates: depot first, then stops in input order
  const allCoords: LatLng[] = [
    input.depot,
    ...input.stops.map(s => ({ lat: s.lat, lng: s.lng })),
  ];

  // Step 1 — Matrix
  const matrix = await osrmClient.getMatrix(allCoords, input.departAt);

  // Step 2 — VRP solve
  const vrpResult = await orToolsClient.solve(
    {
      stops: input.stops,
      depot: input.depot,
      vehicleConstraints: input.vehicleConstraints,
      shiftStartEpoch: input.shiftStartEpoch,
      timeLimitMs: input.timeLimitMs,
    },
    matrix,
  );

  // Step 3 — Maneuvers (optional)
  const orderedCoords: LatLng[] = [
    input.depot,
    ...vrpResult.orderedIds.map(id => {
      const s = input.stops.find(s => s.id === id);
      return s ? { lat: s.lat, lng: s.lng } : input.depot;
    }),
    input.depot, // return to depot
  ];

  const includeManeuvers = input.includeManeuvers ?? !!process.env.VALHALLA_URL;
  const maneuverResult = includeManeuvers
    ? await valhallaClient.getManeuvers(orderedCoords, input.vehicleConstraints)
    : { legs: [], totalDistanceM: 0, totalDurationSec: 0, durationMs: 0, source: 'none' as const };

  const totalMs = Date.now() - t0;

  return {
    orderedIds: vrpResult.orderedIds,
    maneuvers: maneuverResult.source !== 'none' ? maneuverResult : undefined,
    timings: {
      matrixMs: matrix.durationMs,
      solveMs: vrpResult.durationMs,
      maneuverMs: maneuverResult.durationMs,
      totalMs,
    },
    sources: {
      matrix: matrix.source,
      solver: vrpResult.source,
      maneuvers: maneuverResult.source,
    },
  };
}
