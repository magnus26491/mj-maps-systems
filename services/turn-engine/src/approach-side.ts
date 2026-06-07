/**
 * MJ Maps Systems — Approach Side Resolver
 *
 * Determines for every stop:
 *   1. Which side of the road to approach from (UK left-hand traffic)
 *   2. Whether a turn-around is required before the stop
 *   3. The safest turn-around method for the vehicle
 *   4. A pre-alert waypoint (where the driver must start planning)
 *
 * Turn-around methods (priority order):
 *   NOT_REQUIRED      — road is wide enough; proceed normally
 *   USE_TURNING_HEAD  — turning circle/head confirmed in OSM; use it
 *   FORWARD_TURN      — one-manoeuvre wide U-turn
 *   THREE_POINT       — 3-point turn (medium risk; warn 300m out)
 *   REVERSE_OUT       — dead-end reverse (high risk; warn 500m out)
 *   DO_NOT_ENTER      — road physically unsuitable; do not enter at all
 *
 * Accepts TurnScoreResult from EITHER:
 *   - services/turn-engine/src/types.ts  (field: .alert)
 *   - packages/vehicle-profiles/index.ts (field: .alertLevel)
 * Both shapes are normalised internally.
 */

import type { VehicleProfile } from '../../../packages/vehicle-profiles/index';
import type { LatLng } from '../../route-engine/src/types';

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type TurnAroundMethod =
  | 'NOT_REQUIRED'
  | 'USE_TURNING_HEAD'
  | 'FORWARD_TURN'
  | 'THREE_POINT'
  | 'REVERSE_OUT'
  | 'DO_NOT_ENTER';

export type ApproachSide = 'LEFT' | 'RIGHT' | 'EITHER';

export interface ApproachDecision {
  approachSide: ApproachSide;
  turnAroundMethod: TurnAroundMethod;
  alertDistanceM: number;
  preAlertWaypoint: LatLng | null;  // map marker: "make decision here"
  message: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Accept either alert shape from the two different TurnScoreResult interfaces */
export interface TurnScoreInput {
  score: number;
  alert?: 'GREEN' | 'AMBER' | 'RED';        // turn-engine/src/types.ts
  alertLevel?: 'green' | 'amber' | 'red';   // packages/vehicle-profiles/index.ts
  [key: string]: unknown;
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

/** How far before the stop to fire the driver warning, per method */
export const ALERT_M_BY_METHOD: Record<TurnAroundMethod, number> = {
  NOT_REQUIRED:     0,
  USE_TURNING_HEAD: 150,
  FORWARD_TURN:     150,
  THREE_POINT:      300,
  REVERSE_OUT:      500,
  DO_NOT_ENTER:     600,  // earliest possible — reroute before driver commits
};

/**
 * Road must be ≥ FORWARD_TURN_FACTOR × vehicle.widthM for a forward U-turn.
 * Road must be ≥ THREE_POINT_FACTOR  × vehicle.widthM for a 3-point turn.
 */
const FORWARD_TURN_FACTOR = 1.8;
const THREE_POINT_FACTOR  = 1.4;

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Normalise the alert level from either TurnScoreResult shape */
function normaliseAlert(score: TurnScoreInput): 'GREEN' | 'AMBER' | 'RED' {
  if (score.alert) return score.alert;
  if (score.alertLevel) return score.alertLevel.toUpperCase() as 'GREEN' | 'AMBER' | 'RED';
  // Derive from numeric score as final fallback
  if (score.score >= 0.75) return 'GREEN';
  if (score.score >= 0.40) return 'AMBER';
  return 'RED';
}

/**
 * Project a point backwards along a bearing by a given distance.
 * Returns the LatLng of the pre-alert decision waypoint.
 */
function projectBack(lat: number, lng: number, bearing: number, distanceM: number): LatLng {
  const R     = 6_371_000;
  const d     = distanceM / R;
  const brng  = (bearing + 180) % 360;
  const bRad  = brng  * (Math.PI / 180);
  const latR  = lat   * (Math.PI / 180);
  const lngR  = lng   * (Math.PI / 180);

  const newLatR = Math.asin(
    Math.sin(latR) * Math.cos(d) +
    Math.cos(latR) * Math.sin(d) * Math.cos(bRad),
  );
  const newLngR = lngR + Math.atan2(
    Math.sin(bRad) * Math.sin(d) * Math.cos(latR),
    Math.cos(d) - Math.sin(latR) * Math.sin(newLatR),
  );

  return {
    lat: newLatR * (180 / Math.PI),
    lng: newLngR * (180 / Math.PI),
  };
}

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────────

export function resolveApproach(
  score: TurnScoreInput,
  vehicle: VehicleProfile,
  roadWidthM: number | null,
  opts: {
    hasTurningHead: boolean;
    isDeadEnd: boolean;
    deadEndDepthM: number;
    stopLat: number;
    stopLng: number;
    incomingBearing: number;  // degrees 0–360, 0 = North
  },
): ApproachDecision {
  const { hasTurningHead, isDeadEnd, deadEndDepthM, stopLat, stopLng, incomingBearing } = opts;
  const alertNorm   = normaliseAlert(score);
  const width       = roadWidthM ?? vehicle.widthM * 2.5;  // conservative fallback
  const hasWidthData = roadWidthM !== null;

  // UK: deliveries default to LEFT (nearside / kerb side).
  // Enriched by side-of-road-grouper in full pipeline to LEFT|RIGHT|EITHER.
  const approachSide: ApproachSide = 'LEFT';

  let method: TurnAroundMethod;
  let message: string;
  let confidence: ApproachDecision['confidence'];

  // ── Decision tree ────────────────────────────────────────────────────

  if (alertNorm === 'GREEN' && width >= vehicle.widthM * FORWARD_TURN_FACTOR) {
    // ✅ 1. Wide enough — no turn-around needed
    method     = 'NOT_REQUIRED';
    message    = `Road clear for ${vehicle.label}. Approach left kerb normally.`;
    confidence = hasWidthData ? 'HIGH' : 'LOW';

  } else if (hasTurningHead) {
    // ✅ 2. OSM-confirmed turning circle/head available — best safe exit option
    method     = 'USE_TURNING_HEAD';
    message    = `Turning head confirmed ahead. Deliver then pull into turning circle to exit safely.`;
    confidence = 'HIGH';

  } else if (
    alertNorm !== 'RED' &&
    width >= vehicle.widthM * FORWARD_TURN_FACTOR
  ) {
    // ✅ 3. Wide enough for a clean forward U-turn
    method     = 'FORWARD_TURN';
    message    = `Tight but passable. Plan a forward turn at the end of the road for ${vehicle.label}.`;
    confidence = hasWidthData ? 'HIGH' : 'MEDIUM';

  } else if (
    alertNorm !== 'RED' &&
    width >= vehicle.widthM * THREE_POINT_FACTOR
  ) {
    // ⚠️ 4. Only 3-point turn possible
    method     = 'THREE_POINT';
    message    = `Narrow road. You will need a 3-point turn for ${vehicle.label}. Check for oncoming traffic.`;
    confidence = hasWidthData ? 'HIGH' : 'MEDIUM';

  } else if (
    alertNorm === 'RED' &&
    isDeadEnd &&
    deadEndDepthM >= (vehicle.minReverseDepthM ?? vehicle.lengthM * 1.5)
  ) {
    // 🔴 5. RED score + dead end but enough room to reverse out
    method     = 'REVERSE_OUT';
    message    = [
      `⚠️ Road too narrow for forward turn — ${vehicle.label} must reverse out.`,
      `${deadEndDepthM.toFixed(0)}m available. Engage reversing camera before entering.`,
    ].join(' ');
    confidence = 'HIGH';

  } else if (
    alertNorm !== 'RED' &&
    isDeadEnd &&
    deadEndDepthM >= (vehicle.minReverseDepthM ?? vehicle.lengthM * 1.5)
  ) {
    // ⚠️ 6. AMBER + dead end — reverse out
    method     = 'REVERSE_OUT';
    message    = [
      `Dead end. You must reverse out after delivery.`,
      `${deadEndDepthM.toFixed(0)}m of road available. Plan your exit now.`,
    ].join(' ');
    confidence = hasWidthData ? 'HIGH' : 'MEDIUM';

  } else {
    // 🔴 7. No safe manoeuvre possible — do not enter
    method     = 'DO_NOT_ENTER';
    message    = [
      `🔴 DO NOT ENTER — road is physically unsuitable for ${vehicle.label}.`,
      `Reroute now. Attempt delivery on foot or escalate to dispatcher.`,
    ].join(' ');
    confidence = hasWidthData ? 'HIGH' : 'MEDIUM';
  }

  // ── Pre-alert waypoint ───────────────────────────────────────────────────

  const alertDistanceM = ALERT_M_BY_METHOD[method];
  const preAlertWaypoint = alertDistanceM > 0
    ? projectBack(stopLat, stopLng, incomingBearing, alertDistanceM)
    : null;

  return {
    approachSide,
    turnAroundMethod: method,
    alertDistanceM,
    preAlertWaypoint,
    message,
    confidence,
  };
}
