/**
 * MJ Maps Systems — Constraint Aggregator
 *
 * Combines all individual hazard/constraint scores into a single
 * EDGE COST used by the route graph solver.
 *
 * Edge cost represents the "true cost" of travelling from stop A → stop B
 * given the vehicle, time, handedness, and all hazards on that segment.
 *
 * Lower cost = better. Cost 1.0 = nominal (no penalties, no bonuses).
 * Cost > 1.0 = penalised segment. Cost → ∞ = hard block (must not traverse).
 */

import { computeBridgeScore, getBridgeAlert, computeTurnScore, getTurnAlert } from '../../packages/vehicle-profiles/index';
import { getCongestionMultiplier } from '../traffic-engine/index';
import type { VehicleProfile } from '../../packages/vehicle-profiles/index';
import type { DriveHandedness } from '../route-optimizer/index';

// ─── WEIGHT CONSTANTS ─────────────────────────────────────────────────────────
// These are tunable. Values represent multipliers applied to base travel cost.
// Calibrated from Monte Carlo simulation results.

export const CONSTRAINT_WEIGHTS = {
  // Hard blocks — these multiply cost to near-infinity (effectively forbidden)
  HARD_BLOCK_COST: 999_999,

  // Bridge
  bridge_amber:        1.40,   // 40% cost increase — find alternate if easy
  bridge_red:          8.00,   // 8× cost — almost always rerouted
  bridge_emergency:    999_999, // hard block

  // Turn-around
  turn_amber:          1.30,
  turn_red:            6.00,

  // Sharp turn
  sharp_slow:          1.20,
  sharp_avoid:         5.00,

  // Road closure
  closure_warn:        1.50,
  closure_reroute:     999_999, // hard block

  // Traffic congestion (per 0.1 increment above 0.3 baseline)
  congestion_per_unit: 1.08,   // 8% cost increase per 0.1 congestion unit

  // School zone
  school_medium:       1.35,
  school_high:         999_999, // road closed — hard block

  // Railway crossing delay — adds proportional time cost
  crossing_delay_per_min: 1.05, // 5% cost increase per minute of expected wait

  // Kerb-side mismatch penalty — wrong side of road for this handedness
  kerb_mismatch_minor: 1.10,   // slight cross-traffic risk
  kerb_mismatch_major: 1.25,   // significant cross-traffic on fast road
} as const;

// ─── EDGE HAZARD SUMMARY ──────────────────────────────────────────────────────

export interface EdgeHazards {
  /** Bridges on this segment — array because there may be multiple */
  bridges: Array<{
    clearanceM: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    isSigned: boolean;
    communityVerified?: boolean;
  }>;

  /** Turn-around at destination stop */
  turnAround?: {
    roadWidthM: number;
    hasTurningHead: boolean;
    roadLengthToEndM: number;
    communityScore?: number;
    communityReportCount?: number;
  };

  /** Sharp turns on segment */
  sharpTurns: Array<{
    angleDeg: number;
    roadWidthAtTurnM: number;
    isSignposted: boolean;
    surface: 'TARMAC' | 'GRAVEL' | 'COBBLE' | 'MUD';
  }>;

  /** Road closure overlapping this segment */
  closure?: {
    severity: 'FULL_CLOSURE' | 'LANE_CLOSURE' | 'CONTRAFLOW' | 'SPEED_RESTRICTION';
    affectsThisVehicle: boolean;
  };

  /** Whether the destination stop requires crossing traffic */
  kerbMismatch: 'NONE' | 'MINOR' | 'MAJOR';

  /** Railway level crossings on segment */
  crossingDelayMin: number;

  /** School zone risk at destination stop */
  schoolZoneRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ─── AGGREGATED EDGE COST ─────────────────────────────────────────────────────

export interface EdgeCostResult {
  /** Final multiplier applied to nominal travel cost (time + distance) */
  costMultiplier: number;
  /** Whether this edge is a hard block (must not be used) */
  isHardBlock: boolean;
  /** Human-readable reasons for significant penalties */
  penalties: string[];
  /** Whether driver should be warned even if route is allowed */
  hasWarnings: boolean;
}

/**
 * Compute the total cost multiplier for a route edge (segment A → B)
 * given all known hazards and vehicle profile.
 *
 * Used by the VRP solver as the edge weight in the cost matrix.
 */
export function aggregateEdgeCost(params: {
  hazards: EdgeHazards;
  vehicle: VehicleProfile;
  arrivalHourFloat: number;
  handedness: DriveHandedness;
}): EdgeCostResult {
  const { hazards, vehicle, arrivalHourFloat } = params;
  let cost = 1.0;
  const penalties: string[] = [];
  let isHardBlock = false;

  // ── 1. BRIDGE SCORES ────────────────────────────────────────────────────────
  for (const bridge of hazards.bridges) {
    const { score, rawGapM } = computeBridgeScore({
      bridgeClearanceM: bridge.clearanceM,
      vehicleHeightM: vehicle.heightM,
      confidence: bridge.confidence,
      isSigned: bridge.isSigned,
      communityVerified: bridge.communityVerified,
    });
    const alert = getBridgeAlert(score, rawGapM);

    if (alert === 'EMERGENCY' || alert === 'RED') {
      isHardBlock = true;
      penalties.push(`Bridge BLOCK: clearance ${bridge.clearanceM}m vs vehicle ${vehicle.heightM}m`);
      cost = CONSTRAINT_WEIGHTS.HARD_BLOCK_COST;
      break; // no point accumulating further
    } else if (alert === 'AMBER') {
      cost *= CONSTRAINT_WEIGHTS.bridge_amber;
      penalties.push(`Bridge AMBER: ${bridge.clearanceM}m clearance (${Math.round((bridge.clearanceM - vehicle.heightM) * 1000)}mm gap)`);
    } else if (alert === 'INFO') {
      // Minimal cost increase — just informational
      cost *= 1.05;
    }
  }

  if (isHardBlock) return { costMultiplier: cost, isHardBlock, penalties, hasWarnings: true };

  // ── 2. TURN-AROUND SCORE ────────────────────────────────────────────────────
  if (hazards.turnAround) {
    const score = computeTurnScore({ ...hazards.turnAround, vehicleProfile: vehicle });
    const alert = getTurnAlert(score);
    if (alert === 'RED') {
      cost *= CONSTRAINT_WEIGHTS.turn_red;
      penalties.push(`Turn-around RED: road too narrow for ${vehicle.label}`);
    } else if (alert === 'AMBER') {
      cost *= CONSTRAINT_WEIGHTS.turn_amber;
      penalties.push('Turn-around AMBER: tight — approach with caution');
    }
  }

  // ── 3. SHARP TURNS ──────────────────────────────────────────────────────────
  for (const turn of hazards.sharpTurns) {
    const angleNorm = Math.min(turn.angleDeg / 180, 1.0);
    const reqWidth = vehicle.minRoadWidthTurnM * (1 + 0.3 * angleNorm);
    const widthScore = Math.min(turn.roadWidthAtTurnM / reqWidth, 1.0);
    if (widthScore < 0.30) {
      cost *= CONSTRAINT_WEIGHTS.sharp_avoid;
      penalties.push(`Sharp turn AVOID: ${turn.angleDeg}° on ${turn.roadWidthAtTurnM}m road`);
    } else if (widthScore < 0.55) {
      cost *= CONSTRAINT_WEIGHTS.sharp_slow;
      penalties.push(`Sharp turn SLOW: ${turn.angleDeg}° — reduce speed`);
    }
  }

  // ── 4. ROAD CLOSURE ─────────────────────────────────────────────────────────
  if (hazards.closure?.affectsThisVehicle) {
    if (hazards.closure.severity === 'FULL_CLOSURE') {
      isHardBlock = true;
      cost = CONSTRAINT_WEIGHTS.HARD_BLOCK_COST;
      penalties.push('Road CLOSURE: full closure — rerouting');
      return { costMultiplier: cost, isHardBlock, penalties, hasWarnings: true };
    } else {
      cost *= CONSTRAINT_WEIGHTS.closure_warn;
      penalties.push(`Road ${hazards.closure.severity}: expect delays`);
    }
  }

  // ── 5. TRAFFIC CONGESTION ───────────────────────────────────────────────────
  const congestion = getCongestionMultiplier(arrivalHourFloat);
  if (congestion > 0.30) {
    const excessUnits = (congestion - 0.30) / 0.10;
    cost *= Math.pow(CONSTRAINT_WEIGHTS.congestion_per_unit, excessUnits);
    if (congestion > 0.70) {
      penalties.push(`Heavy traffic at ${arrivalHourFloat.toFixed(1)}h (${(congestion * 100).toFixed(0)}% congestion)`);
    }
  }

  // ── 6. SCHOOL ZONE ──────────────────────────────────────────────────────────
  if (hazards.schoolZoneRisk === 'HIGH') {
    isHardBlock = true;
    cost = CONSTRAINT_WEIGHTS.HARD_BLOCK_COST;
    penalties.push('School zone: road closed at school times — rescheduling stop');
    return { costMultiplier: cost, isHardBlock, penalties, hasWarnings: true };
  } else if (hazards.schoolZoneRisk === 'MEDIUM') {
    cost *= CONSTRAINT_WEIGHTS.school_medium;
    penalties.push('School zone: congestion expected — consider rescheduling');
  }

  // ── 7. RAILWAY CROSSING DELAY ───────────────────────────────────────────────
  if (hazards.crossingDelayMin > 0) {
    cost *= Math.pow(CONSTRAINT_WEIGHTS.crossing_delay_per_min, hazards.crossingDelayMin);
    if (hazards.crossingDelayMin > 2) {
      penalties.push(`Level crossing: ~${hazards.crossingDelayMin.toFixed(1)} min expected wait`);
    }
  }

  // ── 8. KERB-SIDE MISMATCH ───────────────────────────────────────────────────
  if (hazards.kerbMismatch === 'MAJOR') {
    cost *= CONSTRAINT_WEIGHTS.kerb_mismatch_major;
    penalties.push('Kerb mismatch: must cross traffic to service stop');
  } else if (hazards.kerbMismatch === 'MINOR') {
    cost *= CONSTRAINT_WEIGHTS.kerb_mismatch_minor;
  }

  return {
    costMultiplier: cost,
    isHardBlock,
    penalties,
    hasWarnings: penalties.length > 0,
  };
}
