/**
 * MJ Maps Systems — Route Engine
 * Approach Planner
 *
 * For each sequenced stop:
 *  1. Calls resolveTurnScore() to get road geometry + turn alert
 *  2. Determines approach side (LEFT/RIGHT/EITHER)
 *  3. Determines turn-around method based on score + segment geometry
 *  4. Pre-computes an alternate approach waypoint for RED stops
 *
 * Approach side logic:
 *  - UK driving: traffic drives on the LEFT.
 *  - Default: approach on the LEFT (same side as traffic direction).
 *  - If stop is on a one-way street: approach side derived from
 *    the direction of travel.
 *  - If OSM 'oneway' tag is 'yes': LEFT approach only.
 *  - No OSM data: EITHER (driver decides).
 *
 * Turn-around method selection:
 *  GREEN  → NOT_REQUIRED (proceed normally)
 *  AMBER, turning head present → FORWARD_TURN
 *  AMBER, no turning head → THREE_POINT
 *  RED    → REVERSE_OUT (driver warned before entry; alternate path computed)
 */

import { resolveTurnScore } from '../../turn-engine/src/resolver';
import type { StopPoint, ApproachedStop, ApproachSide, TurnAroundMethod, LatLng } from './types';
import type { TurnEngineResult } from '../../turn-engine/src/types';

// ─── APPROACH SIDE ────────────────────────────────────────────────────────────

function determineApproachSide(turnResult: TurnEngineResult): ApproachSide {
  const oneway = turnResult.segment.tags?.oneway;
  if (oneway === 'yes' || oneway === '1') return 'LEFT';
  if (turnResult.segment.widthM === null) return 'EITHER';
  // Standard UK two-way road — park left
  return 'LEFT';
}

// ─── TURN-AROUND METHOD ───────────────────────────────────────────────────────

function determineTurnAroundMethod(
  turnResult: TurnEngineResult,
): TurnAroundMethod {
  const { alert, segment } = turnResult;

  if (alert === 'GREEN')  return 'NOT_REQUIRED';
  if (alert === 'RED')    return 'REVERSE_OUT';

  // AMBER
  if (segment.hasTurningHead) return 'FORWARD_TURN';
  return 'THREE_POINT';
}

// ─── ALTERNATE APPROACH WAYPOINT ─────────────────────────────────────────────

/**
 * For RED stops: compute a waypoint ~50m back from the stop, offset
 * perpendicular to approach direction. Driver navigates to this point
 * first, walks to the stop, then drives forward.
 *
 * Simplified: offset 50m in the opposite direction of travel
 * (bearing from previous stop to current stop, reversed).
 *
 * TODO: replace with actual graph-routing to nearest safe pull-in once
 * the routing graph layer is available.
 */
function computeAlternateApproachWaypoint(
  stop: StopPoint,
  previousLocation: LatLng,
): LatLng {
  const STANDOFF_M = 50;
  const R = 6_371_000;

  const dLat = stop.location.lat - previousLocation.lat;
  const dLng = stop.location.lng - previousLocation.lng;
  const dist = Math.sqrt(dLat ** 2 + dLng ** 2);

  if (dist === 0) {
    // Same location edge case — offset due north
    const offsetLat = (STANDOFF_M / R) * (180 / Math.PI);
    return { lat: stop.location.lat - offsetLat, lng: stop.location.lng };
  }

  // Unit vector away from stop
  const unitLat = dLat / dist;
  const unitLng = dLng / dist;

  const offsetLat = (STANDOFF_M / R) * (180 / Math.PI);
  const offsetLng = (STANDOFF_M / (R * Math.cos((stop.location.lat * Math.PI) / 180))) * (180 / Math.PI);

  return {
    lat: stop.location.lat - unitLat * offsetLat,
    lng: stop.location.lng - unitLng * offsetLng,
  };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Process a single stop: resolve turn score, determine approach side,
 * turn-around method, and alternate waypoint if RED.
 */
export async function planStopApproach(
  stop: StopPoint,
  vehicleProfileId: string,
  previousLocation: LatLng,
): Promise<ApproachedStop> {
  const turnResult = await resolveTurnScore(stop.location, vehicleProfileId);

  const approachSide      = determineApproachSide(turnResult);
  const turnAroundMethod  = determineTurnAroundMethod(turnResult);
  const isRed             = turnResult.alert === 'RED';

  return {
    ...stop,
    turnResult,
    approachSide,
    turnAroundMethod,
    hasAlternateApproach: isRed,
    alternateApproachWaypoint: isRed
      ? computeAlternateApproachWaypoint(stop, previousLocation)
      : null,
    alertDistanceM: turnResult.alertDistanceM,
  };
}

/**
 * Process all stops in sequence.
 * Uses concurrency of 5 to avoid overwhelming Overpass.
 */
export async function planAllApproaches(
  stops: StopPoint[],
  vehicleProfileId: string,
  depotLocation: LatLng,
  concurrency = 5,
): Promise<ApproachedStop[]> {
  const results: ApproachedStop[] = [];
  let previousLocation = depotLocation;

  // Process in batches to respect Overpass rate limits
  for (let i = 0; i < stops.length; i += concurrency) {
    const batch = stops.slice(i, i + concurrency);
    const batchPrevious = i === 0 ? depotLocation : stops[i - 1].location;

    const batchResults = await Promise.all(
      batch.map((stop, batchIdx) =>
        planStopApproach(
          stop,
          vehicleProfileId,
          batchIdx === 0 ? batchPrevious : batch[batchIdx - 1].location,
        ),
      ),
    );

    results.push(...batchResults);
    previousLocation = batch[batch.length - 1].location;
  }

  return results;
}
