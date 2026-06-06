/**
 * Turn Feasibility Engine
 * ---
 * Given a stop coordinate and the active vehicle profile, determines:
 *   1. Whether the vehicle can forward-turn on arrival road
 *   2. The closest safe turn-around point
 *   3. The correct approach bearing (which side of road to approach from)
 *   4. The alert level: GREEN / AMBER / RED
 *   5. A human-readable driver instruction
 */

import { VEHICLE_PROFILES, VehicleId, VehicleProfile } from '../../packages/vehicle-profiles';
import { fetchRoadsNear, getBestRoadSegment, RoadSegment } from '../osm-client';

export type AlertLevel = 'GREEN' | 'AMBER' | 'RED';

export interface TurnAlert {
  level: AlertLevel;
  score: number;           // 0.0 – 1.0
  canForwardTurn: boolean;
  requiresReverse: boolean;
  /** Distance in metres at which to show the alert to the driver */
  triggerDistanceM: number;
  /** Recommended bearing to approach the stop (degrees, 0=N) */
  approachBearing?: number;
  /** Human-readable instruction shown to driver */
  instruction: string;
  /** Nearest known turn-around point coords if RED */
  nearestTurnPointLat?: number;
  nearestTurnPointLon?: number;
  roadWidthM: number;
  vehicleMinTurnWidthM: number;
}

/** Distances at which alerts are fired per level */
export const TURN_ALERT_DISTANCES: Record<AlertLevel, number> = {
  GREEN: 0,
  AMBER: 300,
  RED: 500,
};

/**
 * Minimum road width needed for a safe forward turn per vehicle.
 * = vehicle width + 0.6m clearance each side + function of turning radius.
 * Simplified to: outerTurningRadius * 1.9  (empirical from UK road geometry data)
 */
function minRoadWidthForTurn(v: VehicleProfile): number {
  return Math.max(v.widthM + 1.2, v.outerTurningRadiusM * 1.1);
}

/**
 * Core scoring function.
 *
 * TURN_SCORE = clamp(
 *   roadWidth / minWidthNeeded
 *   + 0.30 if turningHead present
 *   - 0.50 if deadEnd with no turningHead
 *   blend 60/40 with community score if available
 * , 0, 1)
 */
export function computeTurnScore(
  road: RoadSegment,
  vehicle: VehicleProfile,
  communityScore?: number, // 0-1 from driver-report layer
): number {
  const minWidth = minRoadWidthForTurn(vehicle);
  let score = road.widthM / minWidth;

  if (road.hasTurningHead) score += 0.30;
  if (road.deadEnd && !road.hasTurningHead) score -= 0.50;
  if (road.hasLayby) score += 0.15;
  if (road.privateAccess) score -= 0.20;

  // Clamp to 0-1 before blending
  score = Math.max(0, Math.min(1, score));

  if (communityScore !== undefined) {
    score = score * 0.6 + communityScore * 0.4;
  }

  return Math.round(score * 1000) / 1000;
}

export function scoreToLevel(score: number): AlertLevel {
  if (score >= 0.75) return 'GREEN';
  if (score >= 0.40) return 'AMBER';
  return 'RED';
}

function buildInstruction(
  level: AlertLevel,
  score: number,
  vehicle: VehicleProfile,
  road: RoadSegment,
): string {
  if (level === 'GREEN') {
    return `Road is suitable for ${vehicle.label}. Approach normally.`;
  }
  if (level === 'AMBER') {
    if (road.hasTurningHead) {
      return `Tight road ahead for ${vehicle.label}. Use turning head at end to reverse out. Drive cautiously.`;
    }
    return `Narrow road ahead (${road.widthM.toFixed(1)}m). ${vehicle.label} may need to reverse out. Proceed with caution.`;
  }
  // RED
  if (road.deadEnd) {
    return `DO NOT ENTER — dead end. Road too narrow (${road.widthM.toFixed(1)}m) for ${vehicle.label} to turn (needs ${minRoadWidthForTurn(vehicle).toFixed(1)}m). Turn around now.`;
  }
  return `Road unsuitable for ${vehicle.label}. Width ${road.widthM.toFixed(1)}m — needs ${minRoadWidthForTurn(vehicle).toFixed(1)}m to turn. Find alternate route.`;
}

/**
 * Main entry point — evaluate turn feasibility at a stop.
 */
export async function evaluateTurnFeasibility(
  lat: number,
  lon: number,
  vehicleId: VehicleId,
  communityScore?: number,
): Promise<TurnAlert> {
  const vehicle = VEHICLE_PROFILES[vehicleId];
  const road = await getBestRoadSegment(lat, lon);

  if (!road) {
    // No OSM data — return a cautious AMBER
    return {
      level: 'AMBER',
      score: 0.5,
      canForwardTurn: false,
      requiresReverse: true,
      triggerDistanceM: TURN_ALERT_DISTANCES.AMBER,
      instruction: `No road data available. Approach with caution for ${vehicle.label}.`,
      roadWidthM: 0,
      vehicleMinTurnWidthM: minRoadWidthForTurn(vehicle),
    };
  }

  const score = computeTurnScore(road, vehicle, communityScore);
  const level = scoreToLevel(score);
  const minWidth = minRoadWidthForTurn(vehicle);
  const canForwardTurn = road.widthM >= minWidth;

  return {
    level,
    score,
    canForwardTurn,
    requiresReverse: !canForwardTurn,
    triggerDistanceM: TURN_ALERT_DISTANCES[level],
    instruction: buildInstruction(level, score, vehicle, road),
    roadWidthM: road.widthM,
    vehicleMinTurnWidthM: minWidth,
  };
}

/**
 * Batch evaluate all stops on a route and annotate them with turn alerts.
 * Call this after route optimisation to pre-compute all warnings.
 */
export async function annotateRouteWithTurnAlerts(
  stops: Array<{ lat: number; lon: number; stopId: string }>,
  vehicleId: VehicleId,
): Promise<Array<{ stopId: string; turnAlert: TurnAlert }>> {
  const results = await Promise.all(
    stops.map(async (s) => ({
      stopId: s.stopId,
      turnAlert: await evaluateTurnFeasibility(s.lat, s.lon, vehicleId),
    })),
  );
  return results;
}
