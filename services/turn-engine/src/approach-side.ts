/**
 * MJ Maps Systems — Approach Side Resolver
 *
 * FIX #3: Turn-Around Intelligence (enhanced)
 *
 * Determines:
 *   1. Which side of the road to approach the stop from
 *   2. Whether a turn-around is required before the stop
 *   3. The safest turn-around method for the vehicle
 *   4. A pre-alert waypoint (where to start slowing / making decisions)
 *
 * This is the "last tactical decision" layer — runs after the turn scorer
 * has already rated the road. The scorer tells you IF you can turn;
 * this module tells you HOW and WHERE.
 *
 * Turn-around methods (in order of preference):
 *   NOT_REQUIRED    — road is wide enough to proceed normally
 *   FORWARD_TURN    — standard wide turn, one manoeuvre
 *   THREE_POINT     — requires a 3-point turn (medium-risk)
 *   REVERSE_OUT     — must reverse from dead end back to junction (high-risk)
 *
 * Inputs:
 *   - TurnScoreResult from scorer.ts
 *   - Vehicle profile
 *   - Road geometry (width, dead-end depth, turning head)
 *   - UK driving side convention (drive on left)
 */

import type { VehicleProfile } from '../../../packages/vehicle-profiles/index';
import type { TurnScoreResult } from './types';
import type { LatLng } from '../../route-engine/src/types';

export type TurnAroundMethod =
  | 'NOT_REQUIRED'
  | 'FORWARD_TURN'
  | 'THREE_POINT'
  | 'REVERSE_OUT';

export type ApproachSide = 'LEFT' | 'RIGHT' | 'EITHER';

export interface ApproachDecision {
  approachSide: ApproachSide;
  turnAroundMethod: TurnAroundMethod;
  alertDistanceM: number;
  preAlertWaypoint: LatLng | null;    // point to display "make decision here" marker
  message: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Alert distances: how far before the stop do we warn the driver?
const ALERT_M_BY_METHOD: Record<TurnAroundMethod, number> = {
  NOT_REQUIRED:  0,
  FORWARD_TURN:  150,
  THREE_POINT:   300,
  REVERSE_OUT:   500,
};

// Vehicle-specific thresholds for turn methods
// minForwardTurnWidthM: road must be at least this wide for a forward turn
// minThreePointWidthM: minimum for a 3-point turn
const FORWARD_TURN_ROAD_FACTOR = 1.8;  // need road ≥ 1.8 × vehicle width for forward turn
const THREE_POINT_ROAD_FACTOR  = 1.4;  // need road ≥ 1.4 × vehicle width for 3-point

export function resolveApproach(
  score: TurnScoreResult,
  vehicle: VehicleProfile,
  roadWidthM: number | null,
  opts: {
    hasTurningHead: boolean;
    isDeadEnd: boolean;
    deadEndDepthM: number;
    stopLat: number;
    stopLng: number;
    incomingBearing: number; // degrees, 0=N
  },
): ApproachDecision {
  const { hasTurningHead, isDeadEnd, deadEndDepthM, stopLat, stopLng, incomingBearing } = opts;

  // ── Approach side (UK: drive on left) ──────────────────────────────────────
  // In the UK deliveries are typically made kerbside (left side of road).
  // If the stop is on the right side we need to pull over safely.
  // Default: LEFT (nearside). Flip to RIGHT if address parity suggests it.
  const approachSide: ApproachSide = 'LEFT'; // enriched by side-of-road-grouper in full pipeline

  // ── Turn-around method ──────────────────────────────────────────────────────
  let turnAroundMethod: TurnAroundMethod;
  let message: string;
  let confidence: ApproachDecision['confidence'] = 'MEDIUM';

  const effectiveWidth = roadWidthM ?? vehicle.widthM * 2.5; // fallback assumption

  if (score.alert === 'GREEN' && effectiveWidth >= vehicle.widthM * FORWARD_TURN_ROAD_FACTOR) {
    turnAroundMethod = 'NOT_REQUIRED';
    message = `Road clear for ${vehicle.label}. Approach normally.`;
    confidence = roadWidthM !== null ? 'HIGH' : 'LOW';

  } else if (hasTurningHead) {
    // Turning head / turning circle available — use it
    turnAroundMethod = 'FORWARD_TURN';
    message = `Turning head ahead. Pull into turning circle after delivery.`;
    confidence = 'HIGH';

  } else if (
    effectiveWidth >= vehicle.widthM * THREE_POINT_ROAD_FACTOR &&
    score.alert !== 'RED'
  ) {
    turnAroundMethod = 'THREE_POINT';
    message = `Tight road. Plan a 3-point turn — check for traffic before manoeuvring.`;
    confidence = roadWidthM !== null ? 'HIGH' : 'MEDIUM';

  } else if (isDeadEnd && deadEndDepthM >= vehicle.minReverseDepthM) {
    turnAroundMethod = 'REVERSE_OUT';
    message = `Dead end — you must reverse out. Engage reversing camera. ${deadEndDepthM.toFixed(0)}m available.`;
    confidence = 'HIGH';

  } else {
    // RED: vehicle cannot safely service this stop with current approach
    turnAroundMethod = 'REVERSE_OUT';
    message = `⚠️ Do NOT enter. Road too narrow for ${vehicle.label}. Reverse now or find alternate access.`;
    confidence = 'HIGH';
  }

  // ── Pre-alert waypoint ──────────────────────────────────────────────────────
  // Project back along incomingBearing by alertDistanceM to get the decision point
  const alertDistanceM = ALERT_M_BY_METHOD[turnAroundMethod];
  const preAlertWaypoint = alertDistanceM > 0
    ? projectBack(stopLat, stopLng, incomingBearing, alertDistanceM)
    : null;

  return {
    approachSide,
    turnAroundMethod,
    alertDistanceM,
    preAlertWaypoint,
    message,
    confidence,
  };
}

/**
 * Project a point backwards along a bearing by a given distance.
 * Returns the lat/lng of the pre-alert decision point.
 */
function projectBack(lat: number, lng: number, bearing: number, distanceM: number): LatLng {
  const R = 6_371_000;
  const d = distanceM / R;
  const brng = (bearing + 180) % 360; // reverse direction
  const brngRad = brng * (Math.PI / 180);
  const latRad  = lat  * (Math.PI / 180);
  const lngRad  = lng  * (Math.PI / 180);

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(d) +
    Math.cos(latRad) * Math.sin(d) * Math.cos(brngRad)
  );
  const newLngRad = lngRad + Math.atan2(
    Math.sin(brngRad) * Math.sin(d) * Math.cos(latRad),
    Math.cos(d) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  return {
    lat: newLatRad * (180 / Math.PI),
    lng: newLngRad * (180 / Math.PI),
  };
}
