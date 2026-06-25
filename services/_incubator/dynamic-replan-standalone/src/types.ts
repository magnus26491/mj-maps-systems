/**
 * Dynamic Replan Engine — types
 *
 * Handles all mid-shift replanning triggers:
 *   FAILED_DROP     — customer not in, access denied, parcel damaged
 *   TRAFFIC_BLOCK   — route segment blocked by incident/congestion
 *   DRIVER_DEVIATION — driver has gone off-route (GPS drift > 200m)
 *   STOP_INSERTED   — dispatcher adds an urgent stop mid-shift
 *   STOP_CANCELLED  — customer cancels while driver is en route
 *   DWELL_OVERRUN   — stop taking much longer than expected
 */

import type { Stop, PlannedRoute, RouteConstraints } from '../../route-engine/src/types';
import type { TrafficIncident } from '../../traffic-engine/src/types';

export type ReplanTrigger =
  | 'FAILED_DROP'
  | 'TRAFFIC_BLOCK'
  | 'DRIVER_DEVIATION'
  | 'STOP_INSERTED'
  | 'STOP_CANCELLED'
  | 'DWELL_OVERRUN';

export interface ReplanRequest {
  trigger:          ReplanTrigger;
  route:            PlannedRoute;
  /** Current driver position */
  currentLat:       number;
  currentLng:       number;
  /** Unix ms — when the replan was triggered */
  triggeredAt:      number;
  /** For FAILED_DROP: the stop that failed */
  failedStop?:      Stop;
  /** For FAILED_DROP: why it failed */
  failReason?:      'NOT_IN' | 'ACCESS_DENIED' | 'DAMAGED' | 'WRONG_ADDRESS' | 'OTHER';
  /** For TRAFFIC_BLOCK: the blocking incident */
  incident?:        TrafficIncident;
  /** For STOP_INSERTED: the new stop to insert */
  insertStop?:      Stop;
  /** For STOP_CANCELLED: the stop id to remove */
  cancelStopId?:    string;
  /** For DWELL_OVERRUN: the stop id and how many seconds over */
  dwellStopId?:     string;
  dwellOverrunSec?: number;
}

export interface ReplanResult {
  success:          boolean;
  updatedRoute:     PlannedRoute;
  /** What changed vs the original route */
  changes:          ReplanChange[];
  /** Stops now impossible to complete in shift */
  newDroppedStops:  Stop[];
  /** Human-readable summary for the driver notification */
  driverMessage:    string;
  replannedIn:      number; // ms
}

export interface ReplanChange {
  type:    'STOP_RESEQUENCED' | 'STOP_DROPPED' | 'STOP_INSERTED' | 'STOP_CANCELLED' | 'ETA_UPDATED';
  stopId:  string;
  detail:  string;
}
