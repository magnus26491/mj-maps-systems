/**
 * Dynamic Replan Engine — core
 *
 * Each trigger type has its own handler. All handlers:
 *   1. Mutate the pending stop list
 *   2. Re-run the route-engine solver from current position
 *   3. Return a ReplanResult with diff + driver message
 *
 * The solver re-run treats the driver's current position as the
 * temporary depot — so the remaining route is re-optimised from
 * exactly where they are now.
 */

import { solve }          from '../../route-engine/src/solver';
import { assignEtas }     from '../../route-engine/src/eta-assignment';
import { haversineM }     from '../../route-engine/src/geo';
import type { Stop, PlannedRoute, RouteConstraints, SolverInput } from '../../route-engine/src/types';
import type { ReplanRequest, ReplanResult, ReplanChange } from './types';

const DEVIATION_THRESHOLD_M = 250; // metres off-route before replan triggered

// ── Helpers ──────────────────────────────────────────────────────────────────

function pendingStops(route: PlannedRoute): Stop[] {
  return route.stops.filter(s => s.status === 'PENDING' || s.status === 'EN_ROUTE');
}

function constraintsFromCurrentPos(
  constraints: RouteConstraints,
  lat: number,
  lng: number,
  nowMs: number,
): RouteConstraints {
  return {
    ...constraints,
    depotLat:     lat,
    depotLng:     lng,
    shiftStartMs: nowMs,
    // Remaining shift time
    maxShiftSeconds: Math.max(
      0,
      constraints.maxShiftSeconds -
      Math.round((nowMs - constraints.shiftStartMs) / 1000),
    ),
  };
}

function buildUpdatedRoute(
  original:     PlannedRoute,
  orderedStops: Stop[],
  droppedStops: Stop[],
  totalDistanceM:   number,
  totalDurationSec: number,
  nowMs:        number,
): PlannedRoute {
  // Merge completed stops back in at the front
  const completed = original.stops.filter(
    s => s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'SKIPPED',
  );
  return {
    ...original,
    stops:            [...completed, ...orderedStops],
    totalDistanceM,
    totalDurationSec,
    blockerCount:     orderedStops.filter(s => s.restrictions && !s.restrictions.clear).length,
    turnWarningCount: orderedStops.filter(s => s.turnScore && (s.turnScore.alertLevel === 'RED' || s.turnScore.alertLevel === 'AMBER')).length,
    lastReplannedAt:  nowMs,
  };
}

// ── Trigger handlers ─────────────────────────────────────────────────────────

function handleFailedDrop(req: ReplanRequest): ReplanResult {
  const start    = Date.now();
  const failed   = req.failedStop!;
  const pending  = pendingStops(req.route).filter(s => s.id !== failed.id);
  const newConstraints = constraintsFromCurrentPos(
    req.route.constraints, req.currentLat, req.currentLng, req.triggeredAt,
  );

  const solverInput: SolverInput = { stops: pending, constraints: newConstraints };
  const solved = solve(solverInput);

  const changes: ReplanChange[] = [
    { type: 'STOP_DROPPED', stopId: failed.id, detail: `Failed: ${req.failReason ?? 'OTHER'}` },
    ...solved.orderedStops.map((s, i) => ({
      type: 'STOP_RESEQUENCED' as const,
      stopId: s.id,
      detail: `Now stop ${i + 1}`,
    })),
  ];

  const updatedRoute = buildUpdatedRoute(
    req.route, solved.orderedStops, solved.droppedStops,
    solved.totalDistanceM, solved.totalDurationSec, req.triggeredAt,
  );

  const next = solved.orderedStops[0];
  const driverMessage = next
    ? `Stop failed — rerouting to ${next.pin.formattedAddress}`
    : 'Stop failed — no more stops remaining in shift';

  return {
    success:         true,
    updatedRoute,
    changes,
    newDroppedStops: solved.droppedStops,
    driverMessage,
    replannedIn:     Date.now() - start,
  };
}

function handleStopCancelled(req: ReplanRequest): ReplanResult {
  const start   = Date.now();
  const cancelId = req.cancelStopId!;
  const pending  = pendingStops(req.route).filter(s => s.id !== cancelId);
  const newConstraints = constraintsFromCurrentPos(
    req.route.constraints, req.currentLat, req.currentLng, req.triggeredAt,
  );

  const solved = solve({ stops: pending, constraints: newConstraints });

  const updatedRoute = buildUpdatedRoute(
    req.route, solved.orderedStops, solved.droppedStops,
    solved.totalDistanceM, solved.totalDurationSec, req.triggeredAt,
  );

  return {
    success:         true,
    updatedRoute,
    changes:         [{ type: 'STOP_CANCELLED', stopId: cancelId, detail: 'Cancelled by customer/dispatcher' }],
    newDroppedStops: solved.droppedStops,
    driverMessage:   `Stop removed — route updated (${solved.orderedStops.length} stops remaining)`,
    replannedIn:     Date.now() - start,
  };
}

function handleStopInserted(req: ReplanRequest): ReplanResult {
  const start    = Date.now();
  const newStop  = req.insertStop!;
  const pending  = [...pendingStops(req.route), newStop];
  const newConstraints = constraintsFromCurrentPos(
    req.route.constraints, req.currentLat, req.currentLng, req.triggeredAt,
  );

  const solved = solve({ stops: pending, constraints: newConstraints });

  const insertedSeq = solved.orderedStops.find(s => s.id === newStop.id)?.sequence;
  const updatedRoute = buildUpdatedRoute(
    req.route, solved.orderedStops, solved.droppedStops,
    solved.totalDistanceM, solved.totalDurationSec, req.triggeredAt,
  );

  return {
    success:         true,
    updatedRoute,
    changes:         [{ type: 'STOP_INSERTED', stopId: newStop.id, detail: `Inserted at position ${insertedSeq ?? '?'}` }],
    newDroppedStops: solved.droppedStops,
    driverMessage:   `New stop added at position ${insertedSeq ?? '?'}: ${newStop.pin.formattedAddress}`,
    replannedIn:     Date.now() - start,
  };
}

function handleDwellOverrun(req: ReplanRequest): ReplanResult {
  const start   = Date.now();
  const pending = pendingStops(req.route);
  // Re-run ETA assignment with current position + delayed start
  const newConstraints = constraintsFromCurrentPos(
    req.route.constraints, req.currentLat, req.currentLng,
    req.triggeredAt + (req.dwellOverrunSec ?? 0) * 1000,
  );

  const solved = solve({ stops: pending, constraints: newConstraints });
  const updatedRoute = buildUpdatedRoute(
    req.route, solved.orderedStops, solved.droppedStops,
    solved.totalDistanceM, solved.totalDurationSec, req.triggeredAt,
  );

  const overMin = Math.round((req.dwellOverrunSec ?? 0) / 60);
  return {
    success:         true,
    updatedRoute,
    changes:         solved.orderedStops.map(s => ({ type: 'ETA_UPDATED' as const, stopId: s.id, detail: `ETA pushed by ~${overMin} min` })),
    newDroppedStops: solved.droppedStops,
    driverMessage:   `Running ${overMin} min late — ETAs updated for remaining ${solved.orderedStops.length} stops`,
    replannedIn:     Date.now() - start,
  };
}

function handleDriverDeviation(req: ReplanRequest): ReplanResult {
  // Re-sequence pending stops from new position
  return handleDwellOverrun({ ...req, dwellOverrunSec: 0 });
}

function handleTrafficBlock(req: ReplanRequest): ReplanResult {
  // For now: treat as dwell overrun with estimated delay from incident
  const delaySec = req.incident
    ? Math.round((req.incident.clearsAt
        ? Math.max(0, req.incident.clearsAt - req.triggeredAt) / 1000
        : 600)) // default 10 min if clearance unknown
    : 600;
  return handleDwellOverrun({ ...req, dwellOverrunSec: delaySec });
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function replan(req: ReplanRequest): ReplanResult {
  switch (req.trigger) {
    case 'FAILED_DROP':      return handleFailedDrop(req);
    case 'STOP_CANCELLED':   return handleStopCancelled(req);
    case 'STOP_INSERTED':    return handleStopInserted(req);
    case 'DWELL_OVERRUN':    return handleDwellOverrun(req);
    case 'DRIVER_DEVIATION': return handleDriverDeviation(req);
    case 'TRAFFIC_BLOCK':    return handleTrafficBlock(req);
    default:
      throw new Error(`Unknown replan trigger: ${(req as ReplanRequest).trigger}`);
  }
}

/**
 * Utility: check if driver has deviated from expected route.
 * Call this every GPS heartbeat (every 30s). Returns true if replan needed.
 */
export function isDeviated(
  currentLat:  number,
  currentLng:  number,
  nextStop:    Stop,
  prevLat:     number,
  prevLng:     number,
): boolean {
  // Distance from current position to the direct line between prev and next stop
  const directDist   = haversineM(prevLat, prevLng, nextStop.pin.lat, nextStop.pin.lng);
  const toNextDist   = haversineM(currentLat, currentLng, nextStop.pin.lat, nextStop.pin.lng);
  const fromPrevDist = haversineM(prevLat, prevLng, currentLat, currentLng);

  if (directDist === 0) return false;

  // Cross-track distance approximation
  const crossTrackM = Math.abs(
    (toNextDist ** 2 - ((directDist - fromPrevDist) ** 2)) / (2 * directDist),
  );

  return crossTrackM > DEVIATION_THRESHOLD_M;
}
