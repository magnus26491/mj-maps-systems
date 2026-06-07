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
} from '../../packages/vehicle-profiles/index.js';
import type { StopPoint } from '../route-engine/src/types.js';

export interface EdgeConstraintScore {
  turnScore: number;
  bridgeScore: number;
  combinedPenalty: number;
  alertLevel: TurnAlertLevel;
  blocked: boolean;
}

// ── Types used by graph.ts ────────────────────────────────────────────────────

export interface EdgeHazards {
  roadWidthM: number;
  hasTurningHead: boolean;
  deadEndLengthM?: number;
  bridgeClearanceM?: number;
  communityScore?: number;
}

export interface EdgeCostResult {
  costMultiplier: number;
  isHardBlock: boolean;
  alertLevel: TurnAlertLevel;
  blocked: boolean;
}

// ── aggregateConstraints ──────────────────────────────────────────────────────

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

// ── aggregateEdgeCost — used by graph.ts ──────────────────────────────────────

/**
 * Higher-level edge cost function used by RouteGraph.buildCostMatrix.
 * Returns a cost multiplier and hard-block flag for a road segment.
 */
export function aggregateEdgeCost(params: {
  hazards: EdgeHazards;
  vehicle: VehicleProfile;
  arrivalHourFloat?: number;
  handedness?: string;
}): EdgeCostResult {
  const { hazards, vehicle } = params;

  const turnResult = computeTurnScore(vehicle, hazards.roadWidthM, {
    hasTurningHead: hazards.hasTurningHead,
    deadEndLengthM: hazards.deadEndLengthM,
    communityScore: hazards.communityScore,
  });

  const bridgeClear = hazards.bridgeClearanceM;
  const bridgeResult = computeBridgeScore(
    vehicle,
    bridgeClear ?? (vehicle.heightM + 2.0),
    bridgeClear ? 'estimated' : 'unknown',
  );

  let alertLevel: TurnAlertLevel = turnResult.alertLevel;
  if (bridgeResult.alertLevel === 'red') alertLevel = 'red';
  else if (bridgeResult.alertLevel === 'amber' && alertLevel === 'green') alertLevel = 'amber';

  const combinedPenalty = (1 - turnResult.score) * 0.7 + (1 - bridgeResult.score) * 0.3;
  const isHardBlock = alertLevel === 'red';

  return {
    costMultiplier: 1 + combinedPenalty * 2,
    isHardBlock,
    alertLevel,
    blocked: isHardBlock,
  };
}
