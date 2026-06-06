/**
 * MJ Maps Systems — Route Engine
 * Core types for stop sequencing, approach logic, and route planning
 */

import type { TurnAlert } from '../../../packages/vehicle-profiles/index';
import type { TurnEngineResult, LatLng } from '../../turn-engine/src/types';

// ─── STOP ────────────────────────────────────────────────────────────────────

export type StopStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface StopPoint {
  /** Unique stop identifier within the route */
  id: string;
  /** Driver-facing label: house number + street, or property name */
  label: string;
  location: LatLng;
  /** Requested delivery/collection window — null = anytime */
  timeWindowStart: string | null;  // ISO
  timeWindowEnd:   string | null;  // ISO
  /** Estimated dwell time at stop in seconds */
  dwellTimeS: number;
  status: StopStatus;
  /** Stop-level notes (access codes, instructions from sender) */
  notes: string | null;
  /** Sequence index in the planned route (0-based) */
  sequenceIndex: number;
}

// ─── APPROACHED STOP ─────────────────────────────────────────────────────────

export type ApproachSide = 'LEFT' | 'RIGHT' | 'EITHER';
export type TurnAroundMethod = 'FORWARD_TURN' | 'REVERSE_OUT' | 'THREE_POINT' | 'NOT_REQUIRED';

export interface ApproachedStop extends StopPoint {
  /** Turn score result from turn-engine */
  turnResult: TurnEngineResult;
  /** Which side of the road to park / deliver from */
  approachSide: ApproachSide;
  /** Recommended turn-around method for this stop */
  turnAroundMethod: TurnAroundMethod;
  /**
   * Whether the route engine has pre-computed an alternate approach path
   * for this stop (used when alert = RED to avoid entering bad road).
   */
  hasAlternateApproach: boolean;
  /** Alternate approach waypoint to navigate to before the stop (if RED) */
  alternateApproachWaypoint: LatLng | null;
  /** Distance from current position at which driver must be alerted */
  alertDistanceM: number;
}

// ─── ROUTE ───────────────────────────────────────────────────────────────────

export type RouteStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface PlannedRoute {
  id: string;
  vehicleProfileId: string;
  depotLocation: LatLng;
  stops: ApproachedStop[];
  /** Total estimated route distance in metres */
  totalDistanceM: number;
  /** Total estimated route duration in seconds */
  totalDurationS: number;
  status: RouteStatus;
  createdAt: string;  // ISO
  /** How many stops were rerouted due to RED turn alerts */
  redStopsRerouted: number;
  /** How many stops were resequenced by anti-backtrack sweep */
  stopsResequenced: number;
}

// ─── SEQUENCING ──────────────────────────────────────────────────────────────

export interface SequencerInput {
  stops: StopPoint[];
  vehicleProfileId: string;
  depotLocation: LatLng;
  /** Honour hard time windows during sequencing */
  respectTimeWindows: boolean;
}

export interface SequencerOutput {
  orderedStops: StopPoint[];
  /** Indexes of stops that were resequenced vs original input order */
  resequencedIndexes: number[];
  /** Estimated total distance saving vs naive order (metres) */
  estimatedSavingM: number;
}

// ─── SWEEP ZONE ──────────────────────────────────────────────────────────────

/**
 * A geographic cluster of stops that should be completed together
 * before moving to the next zone — prevents backtracking.
 */
export interface SweepZone {
  id: string;
  centroid: LatLng;
  radiusM: number;
  stopIds: string[];
  /** Suggested entry bearing (degrees) */
  entryBearing: number | null;
}
