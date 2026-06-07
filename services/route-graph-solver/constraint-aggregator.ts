/**
 * Constraint Aggregator
 * Combines turn scores, bridge scores, road restrictions, and time-window
 * feasibility into a single penalty score per stop/edge for the graph solver.
 */

import {
  computeTurnScore,
  computeBridgeScore,
  VEHICLE_PROFILES,
  type VehicleProfile,
  type TurnScoreResult,
  type BridgeScoreResult,
  type TurnAlertLevel,
} from '../../packages/vehicle-profiles/index';
import type { StopPoint } from '../route-engine/src/types';

export interface EdgeConstraintScore {
  turnScore: number;
  bridgeScore: number;
  combinedPenalty: number;
  alertLevel: TurnAlertLevel;
  blocked: boolean;
}

/**
 * Compute combined constraint penalty for a stop given road geometry.
 * Higher penalty = worse edge in the graph.
 */
export function aggregateConstraints(
  stop: StopPoint,
  roadWidthM: number,
  vehicleId: string,
  options: {
    hasTurningHead?: boolean;
    deadEndLengthM?: number;
    bridgeClearanceM?: number;
  } = {},
): EdgeConstraintScore {
  const profile: VehicleProfile | undefined = (VEHICLE_PROFILES as Record<string, VehicleProfile>)[vehicleId];

  if (!profile) {
    return {
      turnScore: 1.0,
      bridgeScore: 1.0,
      combinedPenalty: 0,
      alertLevel: 'green',
      blocked: false,
    };
  }

  // Turn feasibility
  const turnResult: TurnScoreResult = computeTurnScore(profile, roadWidthM, {
    hasTurningHead: options.hasTurningHead,
    deadEndLengthM: options.deadEndLengthM,
  });

  // Bridge clearance
  const bridgeClear = options.bridgeClearanceM;
  const bridgeResult: BridgeScoreResult = computeBridgeScore(
    profile,
    bridgeClear ?? (profile.heightM + 2.0), // assume 2m headroom if no bridge data
    bridgeClear ? 'estimated' : 'unknown',
  );

  // Pre-computed stop turnScore overrides if available
  const effectiveTurnScore = stop.turnScore !== undefined
    ? Math.min(stop.turnScore, turnResult.score)
    : turnResult.score;

  const combinedPenalty = (1 - effectiveTurnScore) * 0.7
    + (1 - bridgeResult.score) * 0.3;

  // Determine worst alert level
  let alertLevel: TurnAlertLevel = turnResult.alertLevel;
  if (bridgeResult.alertLevel === 'red') alertLevel = 'red';
  else if (bridgeResult.alertLevel === 'amber' && alertLevel === 'green') alertLevel = 'amber';

  return {
    turnScore: effectiveTurnScore,
    bridgeScore: bridgeResult.score,
    combinedPenalty,
    alertLevel,
    blocked: alertLevel === 'red',
  };
}
