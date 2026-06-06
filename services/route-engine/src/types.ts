/**
 * Route Engine — types
 *
 * Central data contracts for the stop sequencer and replan engine.
 * All other services (turn-engine, bridge-engine, traffic-engine,
 * property-engine) feed their results into these structures.
 */

import type { TurnScoreResult } from '../../turn-engine/src/types';
import type { RestrictionCheckResult } from '../../bridge-engine/src/types';
import type { PropertyPin } from '../../property-engine/src/types';

// ─── Stop ────────────────────────────────────────────────────────────────────

export type StopStatus =
  | 'PENDING'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export interface TimeWindow {
  /** Earliest acceptable arrival (Unix ms). null = no constraint */
  earliest: number | null;
  /** Latest acceptable arrival (Unix ms). null = no constraint */
  latest:   number | null;
  /** If true, arriving outside window is a hard failure (not just a warning) */
  hard:     boolean;
}

export interface Stop {
  id:            string;
  sequence:      number;       // 1-based position in the planned route
  pin:           PropertyPin;
  status:        StopStatus;
  timeWindow:    TimeWindow | null;
  /** Expected dwell time in seconds (load/unload + interaction) */
  dwellSeconds:  number;
  /** Parcel / item count at this stop */
  itemCount:     number;
  notes:         string | null;
  /** Barcode / tracking reference */
  reference:     string | null;
  /** Pre-computed turn score for this stop's access road */
  turnScore:     TurnScoreResult | null;
  /** Pre-computed bridge/restriction check for the segment into this stop */
  restrictions:  RestrictionCheckResult | null;
  /** Side of road driver should stop on (L = kerb left, R = kerb right) */
  stopSide:      'L' | 'R' | null;
  /** Planned ETA (Unix ms) */
  eta:           number | null;
  /** Actual arrival time (Unix ms) */
  arrivedAt:     number | null;
  /** Actual departure time (Unix ms) */
  departedAt:    number | null;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export interface RouteConstraints {
  vehicleId:        string;
  /** Shift start time (Unix ms) */
  shiftStartMs:     number;
  /** Max shift duration in seconds */
  maxShiftSeconds:  number;
  /** Max stops per shift */
  maxStops:         number;
  /** Depot / start location */
  depotLat:         number;
  depotLng:         number;
  /** Whether driver must return to depot at end of shift */
  returnToDepot:    boolean;
}

export interface PlannedRoute {
  id:               string;
  vehicleId:        string;
  stops:            Stop[];
  constraints:      RouteConstraints;
  /** Total estimated distance in metres */
  totalDistanceM:   number;
  /** Total estimated duration in seconds */
  totalDurationSec: number;
  /** Number of stops with active bridge/restriction blockers */
  blockerCount:     number;
  /** Number of stops with AMBER/RED turn scores */
  turnWarningCount: number;
  createdAt:        number;
  lastReplannedAt:  number | null;
}

// ─── Solver I/O ──────────────────────────────────────────────────────────────

export interface SolverInput {
  stops:       Stop[];
  constraints: RouteConstraints;
}

export interface SolverResult {
  orderedStops:    Stop[];
  totalDistanceM:  number;
  totalDurationSec: number;
  droppedStops:    Stop[];   // stops that couldn't fit in shift
  solvedIn:        number;   // ms
  algorithm:       string;
}
