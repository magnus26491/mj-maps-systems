/**
 * MJ Maps Systems — Route Engine
 * Approach Planner
 *
 * For each sequenced stop:
 *  1. Calls resolveTurnScore() to get road geometry + turn alert
 *  2. Determines approach side (LEFT / RIGHT / EITHER)
 *  3. Determines turn-around method based on score + segment geometry
 *  4. Pre-computes an alternate approach waypoint for RED stops
 */

import { resolveTurnScore } from '../../turn-engine/src/resolver';
import type { StopPoint, ApproachedStop, ApproachSide, TurnAroundMethod, LatLng } from './types';
import type { TurnEngineResult } from '../../turn-engine/src/types';

// ─── APPROACH SIDE ────────────────────────────────────────────────────────────

function determineApproachSide(turnResult: TurnEngineResult): ApproachSide {
  const oneway = turnResult.segment?.tags?.oneway;
  if (oneway === 'yes' || oneway === '1') return 'LEFT';
  if (turnResult.roadWidthM === null) return 'EITHER';
  return 'LEFT'; // Standard UK two-way road — park left
}

// ─── TURN-AROUND METHOD ───────────────────────────────────────────────────────

function determineTurnAroundMethod(turnResult: TurnEngineResult): TurnAroundMethod {
  if (turnResult.alert === 'GREEN') return 'NOT_REQUIRED';
  if (turnResult.alert === 'RED')   return 'REVERSE_OUT';
  // AMBER
  if (turnResult.hasTurningHead)    return 'FORWARD_TURN';
  return 'THREE_POINT';
}

// ─── ALTERNATE APPROACH WAYPOINT ─────────────────────────────────────────────

/**
 * For RED stops: compute a standoff waypoint ~50m back from the stop.
 * Driver parks here, walks in, then drives away safely.
 */
function computeAlternateApproachWaypoint(
  stop: StopPoint,
  previousLocation: LatLng,
): LatLng {
  const STANDOFF_M = 50;
  const R = 6_371_000;

  const dLat = stop.lat - previousLocation.lat;
  const dLng = stop.lng - previousLocation.lng;
  const dist = Math.sqrt(dLat ** 2 + dLng ** 2);

  if (dist === 0) {
    const offsetLat = (STANDOFF_M / R) * (180 / Math.PI);
    return { lat: stop.lat - offsetLat, lng: stop.lng };
  }

  const unitLat = dLat / dist;
  const unitLng = dLng / dist;
  const offsetLat = (STANDOFF_M / R) * (180 / Math.PI);
  const offsetLng = (STANDOFF_M / (R * Math.cos((stop.lat * Math.PI) / 180))) * (180 / Math.PI);

  return {
    lat: stop.lat - unitLat * offsetLat,
    lng: stop.lng - unitLng * offsetLng,
  };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function planStopApproach(
  stop: StopPoint,
  vehicleProfileId: string,
  previousLocation: LatLng,
): Promise<ApproachedStop> {
  const turnResult = await resolveTurnScore({
    lat: stop.lat,
    lng: stop.lng,
    vehicleId: vehicleProfileId,
  });

  const approachSide     = determineApproachSide(turnResult);
  const turnAroundMethod = determineTurnAroundMethod(turnResult);
  const isRed            = turnResult.alert === 'RED';

  return {
    ...stop,
    approachSide,
    turnAroundMethod,
    turnScore:              turnResult.score,
    turnAlertLevel:         turnResult.alert,
    hasAlternateApproach:   isRed,
    alternateApproachWaypoint: isRed
      ? computeAlternateApproachWaypoint(stop, previousLocation)
      : null,
    alertDistanceM: turnResult.alertDistanceM,
  };
}

export async function planAllApproaches(
  stops: StopPoint[],
  vehicleProfileId: string,
  depotLocation: LatLng,
  concurrency = 5,
): Promise<ApproachedStop[]> {
  const results: ApproachedStop[] = [];

  for (let i = 0; i < stops.length; i += concurrency) {
    const batch        = stops.slice(i, i + concurrency);
    const batchPrev    = i === 0 ? depotLocation : { lat: stops[i - 1].lat, lng: stops[i - 1].lng };

    const batchResults = await Promise.all(
      batch.map((stop, batchIdx) =>
        planStopApproach(
          stop,
          vehicleProfileId,
          batchIdx === 0 ? batchPrev : { lat: batch[batchIdx - 1].lat, lng: batch[batchIdx - 1].lng },
        ),
      ),
    );

    results.push(...batchResults);
  }

  return results;
}
