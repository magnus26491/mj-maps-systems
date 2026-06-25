/**
 * Dynamic Replan Engine
 * Handles mid-shift replanning triggered by:
 *  - Failed delivery attempt
 *  - Driver-requested stop skip
 *  - New stop injected by dispatcher
 *  - Vehicle constraint violation detected at stop
 */

import type {
  StopPoint,
  SequencerInput,
  SequencerOutput,
  PlannedRoute,
} from '../../route-engine/src/types';
import { solveGraph } from '../../route-graph-solver/solver';

export type ReplanReason =
  | 'FAILED_DELIVERY'
  | 'SKIP_REQUESTED'
  | 'NEW_STOP_INJECTED'
  | 'CONSTRAINT_VIOLATION'
  | 'DRIVER_REQUESTED';

export interface ReplanRequest {
  route: PlannedRoute;
  vehicleId: string;
  driverLat: number;
  driverLng: number;
  reason: ReplanReason;
  /** For FAILED_DELIVERY / SKIP_REQUESTED — which stop triggered the replan */
  affectedStopId?: string;
  /** For NEW_STOP_INJECTED — the stop to add */
  newStop?: StopPoint;
  /** Remaining shift time in seconds */
  remainingShiftSec?: number;
}

export interface ReplanResult {
  success: boolean;
  replanReason: ReplanReason;
  originalStopCount: number;
  newStopCount: number;
  stopsDropped: number;
  newRoute: SequencerOutput;
  timeSavedMin: number;
  distanceSavedKm: number;
}

/**
 * Core replan function — takes the current route state and produces
 * an updated SequencerOutput reflecting the new situation.
 */
export async function replan(req: ReplanRequest): Promise<ReplanResult> {
  const { route, vehicleId, driverLat, driverLng, reason, affectedStopId, newStop, remainingShiftSec } = req;

  // Build the set of remaining stops (not yet completed)
  let remainingStops: StopPoint[] = route.stops.filter(s => {
    const status = (s as any).status as string | undefined;
    return status !== 'completed' && status !== 'skipped';
  });

  // Handle each reason
  switch (reason) {
    case 'FAILED_DELIVERY':
    case 'SKIP_REQUESTED':
      if (affectedStopId) {
        remainingStops = remainingStops.filter(s => s.id !== affectedStopId);
      }
      break;

    case 'NEW_STOP_INJECTED':
      if (newStop) {
        remainingStops = [...remainingStops, newStop];
      }
      break;

    case 'CONSTRAINT_VIOLATION':
      if (affectedStopId) {
        // Check restrictions — if turnScore too low, remove
        remainingStops = remainingStops.filter(s => {
          if (s.id !== affectedStopId) return true;
          const ts = s.turnScore ?? 1;
          return ts >= 0.15;
        });
      }
      break;

    case 'DRIVER_REQUESTED':
    default:
      break;
  }

  const originalCount = route.stops.length;

  // Build solver input from driver's current position as the new depot
  const constraints = (route as any).constraints;
  const solverInput: SequencerInput = {
    stops: remainingStops,
    depotLat: driverLat,
    depotLng: driverLng,
    vehicleId,
    shiftStartISO: new Date().toISOString(),
    respectTimeWindows: true,
    ...(constraints ? { constraints } : {}),
    ...(remainingShiftSec ? { maxShiftSeconds: remainingShiftSec } : {}),
  };

  const newRoute = await solveGraph(solverInput);

  const stopsDropped = (newRoute.droppedStops?.length ?? 0)
    + (originalCount - remainingStops.length - (newStop ? -1 : 0));

  // Estimate savings vs original route distance
  const originalDistKm = route.totalDistanceM / 1000;
  const newDistKm = newRoute.totalDistanceKm;

  return {
    success: true,
    replanReason: reason,
    originalStopCount: originalCount,
    newStopCount: newRoute.ordered.length,
    stopsDropped,
    newRoute,
    timeSavedMin: Math.max(0, (originalDistKm - newDistKm) / 30 * 60),
    distanceSavedKm: Math.max(0, originalDistKm - newDistKm),
  };
}

/**
 * Returns true if the driver has deviated beyond thresholdM from their
 * expected position on the planned route. Used by the dynamic-replan
 * service to decide whether a mid-shift replan should be triggered.
 */
export function isDeviated(
  driverLat: number,
  driverLng: number,
  expectedLat: number,
  expectedLng: number,
  thresholdM = 250,
): boolean {
  const R = 6_371_000;
  const dLat = (expectedLat - driverLat) * (Math.PI / 180);
  const dLng = (expectedLng - driverLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(driverLat * (Math.PI / 180)) *
      Math.cos(expectedLat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distM > thresholdM;
}
