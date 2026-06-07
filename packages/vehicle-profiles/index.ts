/**
 * Vehicle Profiles
 * Full geometry constants + scoring functions for UK + worldwide vehicle classes.
 */

export type VehicleId =
  | 'bicycle' | 'motorbike' | 'small_car' | 'large_car'
  | 'swb_van' | 'lwb_van' | 'luton_van'
  | 'tipper_swb' | 'tipper_lwb'
  | '7_5t_rigid' | '18t_rigid' | '26t_rigid'
  | 'artic_13_6m' | 'artic_15_5m'
  | 'car_trailer' | 'horse_trailer' | 'caravan_7m'
  | 'minibus' | 'coach';

/** Broad class grouping used by route-optimizer */
export type VehicleClass = 'light' | 'van' | 'hgv' | 'artic';

export type TurnAlertLevel = 'green' | 'amber' | 'red';

export type TurnAroundMethod = 'forward' | 'three_point' | 'reverse_out' | 'cannot';

export type ClearanceConfidence = 'measured' | 'estimated' | 'inferred' | 'unknown';

export interface VehicleProfile {
  id: VehicleId;
  label: string;
  vehicleClass: VehicleClass;
  lengthM: number;
  widthM: number;
  heightM: number;
  gvwT: number;
  minDriveWidthM: number;
  /** Alias used by some services */
  minRoadWidthTurnM: number;
  outerTurningRadiusM: number;
  innerTurningRadiusM: number;
  minThreePointTurnDiameterM: number;
  hgvRouting: boolean;
  requiresAccessPermit: boolean;
}

export interface TurnScoreResult {
  score: number;              // 0.0 – 1.0
  alertLevel: TurnAlertLevel;
  recommendation: TurnAroundMethod;
  alertDistanceM: number;     // how far in advance to warn the driver
  canEnter: boolean;
  communityBlend: boolean;    // true if community data was used
}

export interface TurnAlert {
  level: TurnAlertLevel;
  message: string;
  distanceM: number;
  recommendation: TurnAroundMethod;
}

export interface BridgeScoreResult {
  score: number;
  alertLevel: TurnAlertLevel;
  clearanceM: number;
  confidence: ClearanceConfidence;
}

export const VEHICLE_PROFILES: Record<VehicleId, VehicleProfile> = {
  bicycle: {
    id: 'bicycle', label: 'Bicycle', vehicleClass: 'light',
    lengthM: 1.8, widthM: 0.6, heightM: 1.1, gvwT: 0.1,
    minDriveWidthM: 0.8, minRoadWidthTurnM: 1.2,
    outerTurningRadiusM: 2.5, innerTurningRadiusM: 1.0,
    minThreePointTurnDiameterM: 3.0, hgvRouting: false, requiresAccessPermit: false,
  },
  motorbike: {
    id: 'motorbike', label: 'Motorbike', vehicleClass: 'light',
    lengthM: 2.2, widthM: 0.8, heightM: 1.2, gvwT: 0.5,
    minDriveWidthM: 1.0, minRoadWidthTurnM: 1.5,
    outerTurningRadiusM: 3.5, innerTurningRadiusM: 1.5,
    minThreePointTurnDiameterM: 4.0, hgvRouting: false, requiresAccessPermit: false,
  },
  small_car: {
    id: 'small_car', label: 'Small Car', vehicleClass: 'light',
    lengthM: 3.9, widthM: 1.7, heightM: 1.5, gvwT: 1.8,
    minDriveWidthM: 2.5, minRoadWidthTurnM: 4.5,
    outerTurningRadiusM: 5.0, innerTurningRadiusM: 2.5,
    minThreePointTurnDiameterM: 7.5, hgvRouting: false, requiresAccessPermit: false,
  },
  large_car: {
    id: 'large_car', label: 'Large Car / SUV', vehicleClass: 'light',
    lengthM: 4.9, widthM: 1.95, heightM: 1.65, gvwT: 2.5,
    minDriveWidthM: 2.8, minRoadWidthTurnM: 5.5,
    outerTurningRadiusM: 6.0, innerTurningRadiusM: 2.8,
    minThreePointTurnDiameterM: 9.0, hgvRouting: false, requiresAccessPermit: false,
  },
  swb_van: {
    id: 'swb_van', label: 'SWB Van (e.g. Transit SWB)', vehicleClass: 'van',
    lengthM: 4.8, widthM: 2.0, heightM: 2.5, gvwT: 3.0,
    minDriveWidthM: 2.8, minRoadWidthTurnM: 5.8,
    outerTurningRadiusM: 5.8, innerTurningRadiusM: 2.2,
    minThreePointTurnDiameterM: 9.0, hgvRouting: false, requiresAccessPermit: false,
  },
  lwb_van: {
    id: 'lwb_van', label: 'LWB Van (e.g. Transit LWB)', vehicleClass: 'van',
    lengthM: 5.5, widthM: 2.0, heightM: 2.5, gvwT: 3.5,
    minDriveWidthM: 3.0, minRoadWidthTurnM: 6.5,
    outerTurningRadiusM: 6.4, innerTurningRadiusM: 2.4,
    minThreePointTurnDiameterM: 10.5, hgvRouting: false, requiresAccessPermit: false,
  },
  luton_van: {
    id: 'luton_van', label: 'Luton Box Van', vehicleClass: 'van',
    lengthM: 6.0, widthM: 2.1, heightM: 3.5, gvwT: 3.5,
    minDriveWidthM: 3.2, minRoadWidthTurnM: 7.5,
    outerTurningRadiusM: 7.2, innerTurningRadiusM: 2.6,
    minThreePointTurnDiameterM: 12.0, hgvRouting: false, requiresAccessPermit: false,
  },
  tipper_swb: {
    id: 'tipper_swb', label: 'Tipper SWB', vehicleClass: 'van',
    lengthM: 5.0, widthM: 2.1, heightM: 2.6, gvwT: 3.5,
    minDriveWidthM: 3.0, minRoadWidthTurnM: 6.2,
    outerTurningRadiusM: 6.2, innerTurningRadiusM: 2.3,
    minThreePointTurnDiameterM: 10.0, hgvRouting: false, requiresAccessPermit: false,
  },
  tipper_lwb: {
    id: 'tipper_lwb', label: 'Tipper LWB', vehicleClass: 'van',
    lengthM: 6.2, widthM: 2.2, heightM: 2.8, gvwT: 3.5,
    minDriveWidthM: 3.2, minRoadWidthTurnM: 7.2,
    outerTurningRadiusM: 7.0, innerTurningRadiusM: 2.5,
    minThreePointTurnDiameterM: 11.5, hgvRouting: false, requiresAccessPermit: false,
  },
  '7_5t_rigid': {
    id: '7_5t_rigid', label: '7.5t Rigid', vehicleClass: 'hgv',
    lengthM: 7.5, widthM: 2.4, heightM: 3.5, gvwT: 7.5,
    minDriveWidthM: 3.5, minRoadWidthTurnM: 9.5,
    outerTurningRadiusM: 9.0, innerTurningRadiusM: 3.0,
    minThreePointTurnDiameterM: 15.0, hgvRouting: true, requiresAccessPermit: false,
  },
  '18t_rigid': {
    id: '18t_rigid', label: '18t Rigid', vehicleClass: 'hgv',
    lengthM: 10.0, widthM: 2.5, heightM: 4.0, gvwT: 18.0,
    minDriveWidthM: 3.8, minRoadWidthTurnM: 12.0,
    outerTurningRadiusM: 11.5, innerTurningRadiusM: 3.5,
    minThreePointTurnDiameterM: 20.0, hgvRouting: true, requiresAccessPermit: false,
  },
  '26t_rigid': {
    id: '26t_rigid', label: '26t Rigid', vehicleClass: 'hgv',
    lengthM: 12.0, widthM: 2.55, heightM: 4.0, gvwT: 26.0,
    minDriveWidthM: 4.0, minRoadWidthTurnM: 14.0,
    outerTurningRadiusM: 13.5, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 24.0, hgvRouting: true, requiresAccessPermit: false,
  },
  artic_13_6m: {
    id: 'artic_13_6m', label: 'Artic (13.6m trailer)', vehicleClass: 'artic',
    lengthM: 16.5, widthM: 2.55, heightM: 4.2, gvwT: 44.0,
    minDriveWidthM: 4.5, minRoadWidthTurnM: 16.0,
    outerTurningRadiusM: 14.5, innerTurningRadiusM: 4.5,
    minThreePointTurnDiameterM: 30.0, hgvRouting: true, requiresAccessPermit: true,
  },
  artic_15_5m: {
    id: 'artic_15_5m', label: 'Artic (15.5m mega-trailer)', vehicleClass: 'artic',
    lengthM: 18.75, widthM: 2.55, heightM: 4.2, gvwT: 44.0,
    minDriveWidthM: 4.8, minRoadWidthTurnM: 18.0,
    outerTurningRadiusM: 16.0, innerTurningRadiusM: 5.0,
    minThreePointTurnDiameterM: 34.0, hgvRouting: true, requiresAccessPermit: true,
  },
  car_trailer: {
    id: 'car_trailer', label: 'Car + Trailer', vehicleClass: 'light',
    lengthM: 9.5, widthM: 2.0, heightM: 1.8, gvwT: 3.5,
    minDriveWidthM: 3.0, minRoadWidthTurnM: 11.0,
    outerTurningRadiusM: 11.0, innerTurningRadiusM: 3.5,
    minThreePointTurnDiameterM: 18.0, hgvRouting: false, requiresAccessPermit: false,
  },
  horse_trailer: {
    id: 'horse_trailer', label: 'Car + Horse Trailer', vehicleClass: 'light',
    lengthM: 10.5, widthM: 2.2, heightM: 2.8, gvwT: 4.5,
    minDriveWidthM: 3.3, minRoadWidthTurnM: 13.0,
    outerTurningRadiusM: 12.5, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 20.0, hgvRouting: false, requiresAccessPermit: false,
  },
  caravan_7m: {
    id: 'caravan_7m', label: 'Car + 7m Caravan', vehicleClass: 'light',
    lengthM: 11.5, widthM: 2.3, heightM: 2.7, gvwT: 4.5,
    minDriveWidthM: 3.3, minRoadWidthTurnM: 14.0,
    outerTurningRadiusM: 13.0, innerTurningRadiusM: 4.2,
    minThreePointTurnDiameterM: 21.0, hgvRouting: false, requiresAccessPermit: false,
  },
  minibus: {
    id: 'minibus', label: 'Minibus (up to 17 seats)', vehicleClass: 'van',
    lengthM: 6.5, widthM: 2.1, heightM: 2.8, gvwT: 5.0,
    minDriveWidthM: 3.2, minRoadWidthTurnM: 9.0,
    outerTurningRadiusM: 8.5, innerTurningRadiusM: 3.0,
    minThreePointTurnDiameterM: 14.0, hgvRouting: false, requiresAccessPermit: false,
  },
  coach: {
    id: 'coach', label: 'Full-Size Coach', vehicleClass: 'hgv',
    lengthM: 12.0, widthM: 2.55, heightM: 4.0, gvwT: 18.0,
    minDriveWidthM: 4.0, minRoadWidthTurnM: 14.0,
    outerTurningRadiusM: 13.0, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 24.0, hgvRouting: true, requiresAccessPermit: false,
  },
};

export const ALL_VEHICLE_IDS = Object.keys(VEHICLE_PROFILES) as VehicleId[];

// ── Turn scoring ─────────────────────────────────────────────────────────────────────

export const TURN_ALERT_DISTANCES: Record<TurnAlertLevel, number> = {
  green: 0,
  amber: 300,
  red: 500,
};

export function computeTurnScore(
  vehicle: VehicleProfile,
  roadWidthM: number,
  options: {
    hasTurningHead?: boolean;
    deadEndLengthM?: number;
    communityScore?: number; // 0-1 from driver reports
  } = {},
): TurnScoreResult {
  const { hasTurningHead = false, deadEndLengthM, communityScore } = options;

  // Base score: ratio of road width to minimum needed to turn
  let score = Math.min(roadWidthM / vehicle.minRoadWidthTurnM, 1.0);

  // Bonus for dedicated turning head
  if (hasTurningHead) score = Math.min(score + 0.30, 1.0);

  // Penalty for very short dead ends
  if (deadEndLengthM !== undefined && deadEndLengthM < 20) score *= 0.5;

  // Blend with community data 60/40 if available
  if (communityScore !== undefined) {
    score = score * 0.6 + communityScore * 0.4;
  }

  score = Math.max(0, Math.min(1, score));

  let alertLevel: TurnAlertLevel;
  let recommendation: TurnAroundMethod;

  if (score >= 0.75) {
    alertLevel = 'green';
    recommendation = 'forward';
  } else if (score >= 0.40) {
    alertLevel = 'amber';
    recommendation = roadWidthM >= vehicle.minThreePointTurnDiameterM / 2 ? 'three_point' : 'reverse_out';
  } else {
    alertLevel = 'red';
    recommendation = 'cannot';
  }

  return {
    score,
    alertLevel,
    recommendation,
    alertDistanceM: TURN_ALERT_DISTANCES[alertLevel],
    canEnter: alertLevel !== 'red',
    communityBlend: communityScore !== undefined,
  };
}

export function getTurnAlert(result: TurnScoreResult, vehicleLabel: string): TurnAlert {
  const messages: Record<TurnAlertLevel, string> = {
    green: `Road ahead is suitable for your ${vehicleLabel}.`,
    amber: `Tight road ahead for ${vehicleLabel}. Approach with caution — ${
      result.recommendation === 'three_point' ? '3-point turn likely needed' : 'reverse exit may be required'
    }.`,
    red: `Road ahead is unsuitable for ${vehicleLabel}. Turn around now.`,
  };

  return {
    level: result.alertLevel,
    message: messages[result.alertLevel],
    distanceM: result.alertDistanceM,
    recommendation: result.recommendation,
  };
}

// ── Bridge scoring ───────────────────────────────────────────────────────────────────

export function computeBridgeScore(
  vehicle: VehicleProfile,
  bridgeClearanceM: number,
  confidence: ClearanceConfidence = 'estimated',
): BridgeScoreResult {
  const margin = bridgeClearanceM - vehicle.heightM;
  const confidencePenalty = confidence === 'measured' ? 0 : confidence === 'estimated' ? 0.05 : 0.15;
  const score = Math.max(0, Math.min(1, (margin / 0.5) - confidencePenalty));

  let alertLevel: TurnAlertLevel;
  if (margin > 0.5) alertLevel = 'green';
  else if (margin > 0.1) alertLevel = 'amber';
  else alertLevel = 'red';

  return { score, alertLevel, clearanceM: bridgeClearanceM, confidence };
}

export function getBridgeAlert(result: BridgeScoreResult, vehicleLabel: string): TurnAlert {
  const messages: Record<TurnAlertLevel, string> = {
    green: `Bridge clearance OK for ${vehicleLabel} (${result.clearanceM}m).`,
    amber: `Low bridge ahead — ${result.clearanceM}m clearance. ${vehicleLabel} height may be marginal.`,
    red: `Bridge too low for ${vehicleLabel}. Do not proceed.`,
  };
  return {
    level: result.alertLevel,
    message: messages[result.alertLevel],
    distanceM: result.alertLevel === 'red' ? 500 : 300,
    recommendation: result.alertLevel === 'red' ? 'cannot' : 'forward',
  };
}
