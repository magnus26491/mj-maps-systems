/**
 * MJ Maps Systems — Vehicle Profile Constants
 * Sources: UK road design guides, HSE, Road Vehicles (Construction and Use) Regulations 1986
 * Reg 13A: articulated vehicles must turn within inner 5.3m / outer 12.5m radius
 * UK max vehicle height: 4.95m (C&U Regs 1986)
 * UK bridge signing threshold: 5.03m (16ft 6in) — all bridges below must be signed
 */

export interface VehicleProfile {
  id: string;
  label: string;
  lengthM: number;
  widthM: number;
  heightM: number;              // typical operational height
  heightMinM: number;           // minimum possible (unladen/lowered)
  heightMaxM: number;           // maximum possible (laden/raised)
  /** Kerb-to-kerb minimum turning radius (metres) */
  minTurnRadiusM: number;
  /** Minimum road width needed to execute a forward turn (metres) */
  minRoadWidthTurnM: number;
  /** Full 360° turning circle diameter (metres) */
  turningCircleDiaM: number;
  /** Minimum road width to travel straight through (metres) */
  minRoadWidthStraightM: number;
  /** Whether this vehicle class requires mandatory height entry before routing */
  requiresHeightEntry: boolean;
  /** Legal max weight class (tonnes) */
  maxWeightT: number;
}

export const VEHICLE_PROFILES: Record<string, VehicleProfile> = {
  car: {
    id: 'car',
    label: 'Small Car',
    lengthM: 4.2, widthM: 1.8, heightM: 1.5, heightMinM: 1.4, heightMaxM: 1.6,
    minTurnRadiusM: 5.0, minRoadWidthTurnM: 3.5,
    turningCircleDiaM: 10.0, minRoadWidthStraightM: 2.5,
    requiresHeightEntry: false, maxWeightT: 2.0,
  },
  suv: {
    id: 'suv',
    label: 'SUV / MPV',
    lengthM: 4.7, widthM: 1.9, heightM: 1.75, heightMinM: 1.6, heightMaxM: 1.9,
    minTurnRadiusM: 5.5, minRoadWidthTurnM: 3.8,
    turningCircleDiaM: 11.0, minRoadWidthStraightM: 2.6,
    requiresHeightEntry: false, maxWeightT: 3.5,
  },
  van_swb: {
    id: 'van_swb',
    label: 'Transit Van (SWB)',
    lengthM: 5.5, widthM: 2.1, heightM: 2.2, heightMinM: 1.9, heightMaxM: 2.5,
    minTurnRadiusM: 6.2, minRoadWidthTurnM: 4.5,
    turningCircleDiaM: 12.4, minRoadWidthStraightM: 2.8,
    requiresHeightEntry: false, maxWeightT: 3.5,
  },
  van_lwb: {
    id: 'van_lwb',
    label: 'Transit Van (LWB)',
    lengthM: 6.5, widthM: 2.1, heightM: 2.2, heightMinM: 1.9, heightMaxM: 2.5,
    minTurnRadiusM: 7.0, minRoadWidthTurnM: 5.0,
    turningCircleDiaM: 14.0, minRoadWidthStraightM: 2.8,
    requiresHeightEntry: false, maxWeightT: 3.5,
  },
  van_high_roof: {
    id: 'van_high_roof',
    label: 'High-Roof Van (e.g. Sprinter Hi)',
    lengthM: 6.0, widthM: 2.1, heightM: 2.7, heightMinM: 2.5, heightMaxM: 2.85,
    minTurnRadiusM: 7.0, minRoadWidthTurnM: 5.0,
    turningCircleDiaM: 14.0, minRoadWidthStraightM: 2.8,
    requiresHeightEntry: true, maxWeightT: 3.5,
  },
  luton: {
    id: 'luton',
    label: 'Luton Box Van',
    lengthM: 7.5, widthM: 2.3, heightM: 3.0, heightMinM: 2.8, heightMaxM: 3.2,
    minTurnRadiusM: 8.0, minRoadWidthTurnM: 5.8,
    turningCircleDiaM: 16.0, minRoadWidthStraightM: 3.0,
    requiresHeightEntry: true, maxWeightT: 7.5,
  },
  hgv_75t: {
    id: 'hgv_75t',
    label: '7.5t Rigid HGV',
    lengthM: 10.0, widthM: 2.5, heightM: 3.5, heightMinM: 3.2, heightMaxM: 3.8,
    minTurnRadiusM: 10.0, minRoadWidthTurnM: 7.0,
    turningCircleDiaM: 20.0, minRoadWidthStraightM: 3.2,
    requiresHeightEntry: true, maxWeightT: 7.5,
  },
  hgv_18t: {
    id: 'hgv_18t',
    label: '18t Rigid HGV',
    lengthM: 12.5, widthM: 2.5, heightM: 3.8, heightMinM: 3.5, heightMaxM: 4.0,
    minTurnRadiusM: 12.5, minRoadWidthTurnM: 8.5,
    turningCircleDiaM: 25.0, minRoadWidthStraightM: 3.5,
    requiresHeightEntry: true, maxWeightT: 18.0,
  },
  artic: {
    id: 'artic',
    label: 'Articulated HGV (EU std)',
    lengthM: 16.5, widthM: 2.55, heightM: 4.0, heightMinM: 3.8, heightMaxM: 4.2,
    minTurnRadiusM: 12.5, minRoadWidthTurnM: 12.5,
    turningCircleDiaM: 25.0, minRoadWidthStraightM: 3.7,
    requiresHeightEntry: true, maxWeightT: 44.0,
  },
  artic_highcube: {
    id: 'artic_highcube',
    label: 'High-Cube / Refrigerated Artic',
    lengthM: 16.5, widthM: 2.55, heightM: 4.2, heightMinM: 4.0, heightMaxM: 4.35,
    minTurnRadiusM: 12.5, minRoadWidthTurnM: 12.5,
    turningCircleDiaM: 25.0, minRoadWidthStraightM: 3.7,
    requiresHeightEntry: true, maxWeightT: 44.0,
  },
  double_deck: {
    id: 'double_deck',
    label: 'Double-Deck Trailer',
    lengthM: 16.5, widthM: 2.55, heightM: 4.8, heightMinM: 4.2, heightMaxM: 4.95,
    minTurnRadiusM: 12.5, minRoadWidthTurnM: 12.5,
    turningCircleDiaM: 25.0, minRoadWidthStraightM: 3.7,
    requiresHeightEntry: true, maxWeightT: 44.0,
  },
};

// ─── TURN SCORE ENGINE ───────────────────────────────────────────────────────

/**
 * Compute TURN_SCORE for a road approach
 * Returns 0.0 (impassable) to 1.0 (fully safe to forward-turn)
 *
 * Thresholds:  >= 0.75 → GREEN (enter)  |  0.40-0.74 → AMBER (warn 300m)  |  < 0.40 → RED (reroute 500m)
 */
export function computeTurnScore(params: {
  roadWidthM: number;
  hasTurningHead: boolean;
  roadLengthToEndM: number;
  vehicleProfile: VehicleProfile;
  communityScore?: number;
  communityReportCount?: number;
}): number {
  const { roadWidthM, hasTurningHead, roadLengthToEndM, vehicleProfile,
          communityScore, communityReportCount = 0 } = params;

  let baseScore = Math.min(roadWidthM / vehicleProfile.minRoadWidthTurnM, 1.0);
  if (hasTurningHead) baseScore = Math.min(baseScore + 0.30, 1.0);
  if (roadLengthToEndM < 20) baseScore *= 0.50;

  if (communityReportCount > 0 && communityScore !== undefined) {
    return clamp(0.60 * baseScore + 0.40 * communityScore);
  }
  return clamp(baseScore);
}

// ─── BRIDGE SCORE ENGINE ─────────────────────────────────────────────────────

export type ClearanceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

const CONFIDENCE_MULTIPLIERS: Record<ClearanceConfidence, number> = {
  HIGH: 1.00,   // signed + Network Rail verified
  MEDIUM: 0.85, // OSM maxheight tag only
  LOW: 0.65,    // inferred from satellite / community estimate
};

/** UK legal signing threshold: all bridges below 5.03m (16ft 6in) must be signed */
export const UK_BRIDGE_SIGN_THRESHOLD_M = 5.03;

/**
 * Compute BRIDGE_SCORE for a bridge on route
 * Returns 0.0 (definite strike) to 1.0 (full clearance)
 *
 * Thresholds:
 *   1.0          → NO ALERT
 *   0.80-0.99    → INFO — HUD shows bridge height
 *   0.40-0.79    → AMBER WARNING at 500m
 *   < 0.40       → RED BLOCK — reroute at 800m
 *   raw_gap < 0  → EMERGENCY REROUTE — audio + haptic
 */
export function computeBridgeScore(params: {
  bridgeClearanceM: number;
  vehicleHeightM: number;
  safetyMarginM?: number;
  confidence: ClearanceConfidence;
  isSigned: boolean;
  communityVerified?: boolean;
}): { score: number; rawGapM: number; mustReroute: boolean } {
  const {
    bridgeClearanceM, vehicleHeightM,
    safetyMarginM = 0.30,
    confidence, isSigned, communityVerified = false,
  } = params;

  const requiredClearance = vehicleHeightM + safetyMarginM;
  const rawGapM = bridgeClearanceM - requiredClearance;

  // Definite strike — vehicle physically cannot pass
  if (rawGapM < 0) {
    return { score: 0.0, rawGapM, mustReroute: true };
  }

  // < 100mm gap — too marginal regardless of confidence
  if (rawGapM < 0.10) {
    return { score: 0.0, rawGapM, mustReroute: true };
  }

  // Proportional score: 0-500mm gap maps to 0.0-1.0
  let baseScore = rawGapM >= 0.50 ? 1.0 : rawGapM / 0.50;

  // Apply confidence multiplier
  baseScore *= CONFIDENCE_MULTIPLIERS[confidence];

  // Unsigned low bridge — data may be stale or wrong; apply extra conservative penalty
  if (!isSigned && bridgeClearanceM < UK_BRIDGE_SIGN_THRESHOLD_M) {
    baseScore *= 0.75;
  }

  // Community verification boosts confidence towards HIGH
  if (communityVerified && confidence !== 'HIGH') {
    baseScore = Math.min(baseScore * 1.15, 1.0);
  }

  return {
    score: clamp(baseScore),
    rawGapM,
    mustReroute: baseScore < 0.40,
  };
}

// ─── ROAD CLOSURE ENGINE ────────────────────────────────────────────────────

export type ClosureSource = 'NTIS_LIVE' | 'ONE_NETWORK' | 'ELGIN' | 'OSM' | 'COMMUNITY';
export type ClosureSeverity = 'FULL_CLOSURE' | 'LANE_CLOSURE' | 'CONTRAFLOW' | 'SPEED_RESTRICTION';

export interface RoadClosure {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;             // affected area radius
  severity: ClosureSeverity;
  source: ClosureSource;
  startsAt: string;            // ISO timestamp
  endsAt: string | null;       // null = indefinite
  description: string;
  diversionRouteRef?: string;  // official diversion if provided
  affectsVehicleClasses?: string[]; // null = all vehicles affected
  heightRestrictionM?: number; // for vehicle-height-specific closures
  weightRestrictionT?: number; // for weight-restricted sections
}

/**
 * Evaluate whether a road closure affects the current vehicle profile
 * and return a recommended action.
 */
export function evaluateClosure(
  closure: RoadClosure,
  vehicle: VehicleProfile
): { affected: boolean; action: 'PASS' | 'WARN' | 'REROUTE'; reason: string } {
  // Full closures always reroute
  if (closure.severity === 'FULL_CLOSURE') {
    return { affected: true, action: 'REROUTE', reason: `Full road closure: ${closure.description}` };
  }

  // Height restriction check
  if (closure.heightRestrictionM !== undefined) {
    if (vehicle.heightM > closure.heightRestrictionM) {
      return {
        affected: true, action: 'REROUTE',
        reason: `Height restriction ${closure.heightRestrictionM}m — vehicle is ${vehicle.heightM}m`,
      };
    }
  }

  // Weight restriction check
  if (closure.weightRestrictionT !== undefined) {
    if (vehicle.maxWeightT > closure.weightRestrictionT) {
      return {
        affected: true, action: 'REROUTE',
        reason: `Weight restriction ${closure.weightRestrictionT}t — vehicle class is ${vehicle.maxWeightT}t`,
      };
    }
  }

  // Vehicle class specific closures
  if (closure.affectsVehicleClasses && !closure.affectsVehicleClasses.includes(vehicle.id)) {
    return { affected: false, action: 'PASS', reason: 'Closure does not affect this vehicle class' };
  }

  // Lane closure / contraflow — warn but allow passage
  if (closure.severity === 'LANE_CLOSURE' || closure.severity === 'CONTRAFLOW') {
    return { affected: true, action: 'WARN', reason: `${closure.severity}: ${closure.description}` };
  }

  return { affected: false, action: 'PASS', reason: 'No restriction for this vehicle' };
}

// ─── ALERT TYPES ─────────────────────────────────────────────────────────────

export type TurnAlert = 'GREEN' | 'AMBER' | 'RED';
export type BridgeAlert = 'CLEAR' | 'INFO' | 'AMBER' | 'RED' | 'EMERGENCY';

export function getTurnAlert(score: number): TurnAlert {
  if (score >= 0.75) return 'GREEN';
  if (score >= 0.40) return 'AMBER';
  return 'RED';
}

export function getBridgeAlert(score: number, rawGapM: number): BridgeAlert {
  if (rawGapM < 0) return 'EMERGENCY';
  if (score >= 1.00) return 'CLEAR';
  if (score >= 0.80) return 'INFO';
  if (score >= 0.40) return 'AMBER';
  return 'RED';
}

/** Alert trigger distances (metres before the hazard) */
export const ALERT_DISTANCES = {
  turn: { AMBER: 300, RED: 500 },
  bridge: { INFO: 300, AMBER: 500, RED: 800, EMERGENCY: 1000 },
  closure: { WARN: 500, REROUTE: 800 },
} as const;

// ─── UTILS ───────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0.0, max = 1.0): number {
  return Math.max(min, Math.min(max, v));
}
