// ─────────────────────────────────────────────────────────────────────────────
// MJ Maps — Vehicle Profiles & Turn-Feasibility Engine
// ─────────────────────────────────────────────────────────────────────────────

export type VehicleClass =
  | 'bicycle'
  | 'motorcycle'
  | 'car'
  | 'swb_van'
  | 'lwb_van'
  | 'luton'
  | 'transit_tipper'
  | 'minibus'
  | 'coach'
  | 'rigid_75t'
  | 'rigid_18t'
  | 'artic_13_6m'
  | 'artic_16_5m';

export interface VehicleProfile {
  id: VehicleClass;
  label: string;
  /** Overall length in metres */
  lengthM: number;
  /** Width including mirrors in metres */
  widthM: number;
  /** Height in metres */
  heightM: number;
  /** Kerb-to-kerb turning radius in metres */
  turningRadiusM: number;
  /** Gross vehicle weight in tonnes */
  gvwT: number;
  /** Minimum road width needed for a forward 3-point turn, metres */
  minRoadWidthTurn: number;
  /** Minimum cul-de-sac / turning-head diameter for 1-shot turn, metres */
  minTurningHeadDiamM: number;
  /** Can legally use residential permit zones */
  residentialAccess: boolean;
  /** Requires prior access notice for private roads */
  requiresNotice: boolean;
}

export const VEHICLE_PROFILES: Record<VehicleClass, VehicleProfile> = {
  bicycle: {
    id: 'bicycle', label: 'Bicycle', lengthM: 1.8, widthM: 0.6, heightM: 1.2,
    turningRadiusM: 1.5, gvwT: 0.1, minRoadWidthTurn: 2.0,
    minTurningHeadDiamM: 3.5, residentialAccess: true, requiresNotice: false,
  },
  motorcycle: {
    id: 'motorcycle', label: 'Motorcycle', lengthM: 2.2, widthM: 0.8, heightM: 1.4,
    turningRadiusM: 3.0, gvwT: 0.4, minRoadWidthTurn: 3.5,
    minTurningHeadDiamM: 6.0, residentialAccess: true, requiresNotice: false,
  },
  car: {
    id: 'car', label: 'Car / SUV', lengthM: 4.5, widthM: 2.1, heightM: 1.6,
    turningRadiusM: 5.5, gvwT: 2.0, minRoadWidthTurn: 6.5,
    minTurningHeadDiamM: 11.0, residentialAccess: true, requiresNotice: false,
  },
  swb_van: {
    id: 'swb_van', label: 'SWB Van (Transit / Sprinter SWB)', lengthM: 5.1, widthM: 2.4, heightM: 2.5,
    turningRadiusM: 6.3, gvwT: 3.5, minRoadWidthTurn: 7.5,
    minTurningHeadDiamM: 13.0, residentialAccess: true, requiresNotice: false,
  },
  lwb_van: {
    id: 'lwb_van', label: 'LWB Van (Transit LWB / Sprinter LWB)', lengthM: 6.0, widthM: 2.4, heightM: 2.7,
    turningRadiusM: 7.2, gvwT: 3.5, minRoadWidthTurn: 8.5,
    minTurningHeadDiamM: 15.0, residentialAccess: true, requiresNotice: false,
  },
  luton: {
    id: 'luton', label: 'Luton Box Van', lengthM: 6.5, widthM: 2.5, heightM: 3.3,
    turningRadiusM: 7.5, gvwT: 3.5, minRoadWidthTurn: 9.0,
    minTurningHeadDiamM: 15.5, residentialAccess: true, requiresNotice: false,
  },
  transit_tipper: {
    id: 'transit_tipper', label: 'Transit Tipper / Dropside', lengthM: 6.0, widthM: 2.5, heightM: 2.6,
    turningRadiusM: 7.2, gvwT: 3.5, minRoadWidthTurn: 8.5,
    minTurningHeadDiamM: 15.0, residentialAccess: true, requiresNotice: false,
  },
  minibus: {
    id: 'minibus', label: 'Minibus (16 seat)', lengthM: 6.5, widthM: 2.3, heightM: 2.8,
    turningRadiusM: 7.8, gvwT: 4.5, minRoadWidthTurn: 9.5,
    minTurningHeadDiamM: 16.0, residentialAccess: true, requiresNotice: false,
  },
  coach: {
    id: 'coach', label: 'Coach / Full-size Bus', lengthM: 12.0, widthM: 2.55, heightM: 3.8,
    turningRadiusM: 12.0, gvwT: 18.0, minRoadWidthTurn: 14.5,
    minTurningHeadDiamM: 24.0, residentialAccess: false, requiresNotice: true,
  },
  rigid_75t: {
    id: 'rigid_75t', label: '7.5t Rigid HGV', lengthM: 8.5, widthM: 2.55, heightM: 3.7,
    turningRadiusM: 8.5, gvwT: 7.5, minRoadWidthTurn: 10.5,
    minTurningHeadDiamM: 17.5, residentialAccess: false, requiresNotice: false,
  },
  rigid_18t: {
    id: 'rigid_18t', label: '18t Rigid HGV', lengthM: 12.0, widthM: 2.6, heightM: 4.0,
    turningRadiusM: 11.0, gvwT: 18.0, minRoadWidthTurn: 14.0,
    minTurningHeadDiamM: 22.5, residentialAccess: false, requiresNotice: true,
  },
  artic_13_6m: {
    id: 'artic_13_6m', label: 'Artic 13.6m Trailer', lengthM: 16.5, widthM: 2.6, heightM: 4.2,
    turningRadiusM: 14.5, gvwT: 44.0, minRoadWidthTurn: 17.0,
    minTurningHeadDiamM: 29.0, residentialAccess: false, requiresNotice: true,
  },
  artic_16_5m: {
    id: 'artic_16_5m', label: 'Artic 16.5m Trailer (Mega)', lengthM: 18.75, widthM: 2.6, heightM: 4.5,
    turningRadiusM: 16.0, gvwT: 44.0, minRoadWidthTurn: 19.0,
    minTurningHeadDiamM: 32.0, residentialAccess: false, requiresNotice: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Turn-Alert Distances (metres before the problematic point)
// ─────────────────────────────────────────────────────────────────────────────
export const TURN_ALERT_DISTANCES = {
  GREEN: 0,
  AMBER: 300,
  RED: 500,
} as const;

export type TurnAlertLevel = 'GREEN' | 'AMBER' | 'RED';

export interface RoadGeometry {
  /** Estimated kerb-to-kerb width in metres (from OSM width tag or CV estimate) */
  roadWidthM: number;
  /** Estimated diameter of turning head / cul-de-sac in metres; 0 = none detected */
  turningHeadDiamM: number;
  /** Distance from driver's current position to the point of no return, metres */
  distanceToDeadEndM: number;
  /** Whether OSM or community reports say this road is a dead-end */
  isDeadEnd: boolean;
  /** OSM highway class */
  highwayClass:
    | 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary'
    | 'unclassified' | 'residential' | 'service' | 'track' | 'path' | 'private';
  /** Optional community-sourced override score 0..1 (1 = fully trusted) */
  communityScoreOverride?: number;
  /** Estimated axle weight limit in tonnes; undefined = unknown */
  weightLimitT?: number;
  /** Height restriction in metres; undefined = none */
  heightRestrictionM?: number;
}

export interface TurnFeasibilityResult {
  score: number;          // 0..1
  alert: TurnAlertLevel;
  alertDistanceM: number;
  canForwardTurn: boolean;
  canUseHead: boolean;
  mustReverse: boolean;
  mustNotEnter: boolean;
  /** Human-readable driver instruction */
  instruction: string;
  /** Why this score was calculated */
  reasoning: string[];
}

/**
 * Compute turn feasibility score for a given vehicle entering a given road segment.
 *
 * Score derivation:
 *   base  = clamp(roadWidthM / minRoadWidthTurn, 0, 1)
 *   +0.30  if turning head diameter >= vehicle.minTurningHeadDiamM
 *   ×0.50  penalty if dead-end sooner than 2× vehicle length
 *   final = blend 60% geometry + 40% community reports (when available)
 */
export function computeTurnScore(
  vehicle: VehicleProfile,
  road: RoadGeometry,
): TurnFeasibilityResult {
  const reasoning: string[] = [];
  let score = 0;

  // 1. Base score: road width vs minimum needed for forward turn
  const widthRatio = Math.min(road.roadWidthM / vehicle.minRoadWidthTurn, 1.0);
  score = widthRatio;
  reasoning.push(
    `Road width ${road.roadWidthM.toFixed(1)}m vs required ${vehicle.minRoadWidthTurn}m → width ratio ${widthRatio.toFixed(2)}`,
  );

  // 2. Turning head bonus
  const canUseHead = road.turningHeadDiamM >= vehicle.minTurningHeadDiamM;
  if (canUseHead) {
    score = Math.min(score + 0.30, 1.0);
    reasoning.push(
      `Turning head ${road.turningHeadDiamM}m ≥ required ${vehicle.minTurningHeadDiamM}m (+0.30 bonus)`,
    );
  } else if (road.turningHeadDiamM > 0) {
    reasoning.push(
      `Turning head ${road.turningHeadDiamM}m < required ${vehicle.minTurningHeadDiamM}m (no bonus)`,
    );
  }

  // 3. Dead-end penalty — caught too close to end
  const dangerThreshold = vehicle.lengthM * 2;
  if (road.isDeadEnd && road.distanceToDeadEndM < dangerThreshold) {
    score *= 0.50;
    reasoning.push(
      `Dead-end only ${road.distanceToDeadEndM}m away (< ${dangerThreshold}m threshold) → ×0.50 penalty`,
    );
  }

  // 4. Hard overrides: height / weight restrictions
  if (road.heightRestrictionM !== undefined && road.heightRestrictionM < vehicle.heightM) {
    score = 0;
    reasoning.push(
      `Height restriction ${road.heightRestrictionM}m < vehicle height ${vehicle.heightM}m → MUST NOT ENTER`,
    );
  }
  if (road.weightLimitT !== undefined && road.weightLimitT < vehicle.gvwT) {
    score = 0;
    reasoning.push(
      `Weight limit ${road.weightLimitT}t < vehicle GVW ${vehicle.gvwT}t → MUST NOT ENTER`,
    );
  }

  // 5. Blend with community score if available
  if (road.communityScoreOverride !== undefined) {
    const blended = score * 0.60 + road.communityScoreOverride * 0.40;
    reasoning.push(
      `Community score ${road.communityScoreOverride.toFixed(2)} blended 40% → final ${blended.toFixed(2)}`,
    );
    score = blended;
  }

  score = Math.max(0, Math.min(1, score));

  // 6. Derive alert level
  let alert: TurnAlertLevel;
  if (score >= 0.75) alert = 'GREEN';
  else if (score >= 0.40) alert = 'AMBER';
  else alert = 'RED';

  const alertDistanceM = TURN_ALERT_DISTANCES[alert];

  // 7. Derive action flags
  const canForwardTurn = score >= 0.75;
  const mustReverse = score >= 0.40 && !canForwardTurn;
  const mustNotEnter = score < 0.40;

  // 8. Driver instruction
  let instruction: string;
  if (mustNotEnter) {
    instruction = `⛔ DO NOT ENTER — ${vehicle.label} cannot safely manoeuvre on this road. Find an alternative approach.`;
  } else if (mustReverse) {
    instruction = `⚠️ CAUTION — Limited room. You may need to reverse out. Proceed slowly and locate a passing place before entering.`;
  } else if (canUseHead) {
    instruction = `✅ CLEAR — Turning head available. You can turn around using the turning head ahead.`;
  } else {
    instruction = `✅ CLEAR — Sufficient road width for a 3-point turn.`;
  }

  return {
    score,
    alert,
    alertDistanceM,
    canForwardTurn,
    canUseHead,
    mustReverse,
    mustNotEnter,
    instruction,
    reasoning,
  };
}

/** Quick helper — just returns the alert level */
export function getTurnAlert(vehicle: VehicleProfile, road: RoadGeometry): TurnAlertLevel {
  return computeTurnScore(vehicle, road).alert;
}
