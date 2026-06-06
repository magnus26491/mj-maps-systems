/**
 * MJ Maps Systems — Vehicle Profile Constants
 * Sources: UK road design guides, HSE, Road Vehicles (Construction and Use) Regulations 1986
 */

export interface VehicleProfile {
  id: string;
  label: string;
  lengthM: number;
  widthM: number;
  /** Kerb-to-kerb minimum turning radius (metres) */
  minTurnRadiusM: number;
  /** Minimum road width needed to execute a forward turn (metres) */
  minRoadWidthTurnM: number;
  /** Full 360° turning circle diameter (metres) */
  turningCircleDiaM: number;
  /** Minimum road width to travel straight through (metres) */
  minRoadWidthStraightM: number;
}

export const VEHICLE_PROFILES: Record<string, VehicleProfile> = {
  car: {
    id: 'car',
    label: 'Small Car',
    lengthM: 4.2,
    widthM: 1.8,
    minTurnRadiusM: 5.0,
    minRoadWidthTurnM: 3.5,
    turningCircleDiaM: 10.0,
    minRoadWidthStraightM: 2.5,
  },
  van_swb: {
    id: 'van_swb',
    label: 'Transit Van (SWB)',
    lengthM: 5.5,
    widthM: 2.1,
    minTurnRadiusM: 6.2,
    minRoadWidthTurnM: 4.5,
    turningCircleDiaM: 12.4,
    minRoadWidthStraightM: 2.8,
  },
  van_lwb: {
    id: 'van_lwb',
    label: 'Transit Van (LWB)',
    lengthM: 6.5,
    widthM: 2.1,
    minTurnRadiusM: 7.0,
    minRoadWidthTurnM: 5.0,
    turningCircleDiaM: 14.0,
    minRoadWidthStraightM: 2.8,
  },
  luton: {
    id: 'luton',
    label: 'Luton Box Van',
    lengthM: 7.5,
    widthM: 2.3,
    minTurnRadiusM: 8.0,
    minRoadWidthTurnM: 5.8,
    turningCircleDiaM: 16.0,
    minRoadWidthStraightM: 3.0,
  },
  hgv_75t: {
    id: 'hgv_75t',
    label: '7.5t Rigid HGV',
    lengthM: 10.0,
    widthM: 2.5,
    minTurnRadiusM: 10.0,
    minRoadWidthTurnM: 7.0,
    turningCircleDiaM: 20.0,
    minRoadWidthStraightM: 3.2,
  },
  hgv_18t: {
    id: 'hgv_18t',
    label: '18t Rigid HGV',
    lengthM: 12.5,
    widthM: 2.5,
    minTurnRadiusM: 12.5,
    minRoadWidthTurnM: 8.5,
    turningCircleDiaM: 25.0,
    minRoadWidthStraightM: 3.5,
  },
  artic: {
    id: 'artic',
    label: 'Articulated HGV (EU std)',
    // UK/EU legislation: inner 5.3m radius / outer 12.5m radius
    // Road Vehicles (Construction and Use) Regulations 1986, Reg 13A
    lengthM: 16.5,
    widthM: 2.55,
    minTurnRadiusM: 12.5,
    minRoadWidthTurnM: 12.5,
    turningCircleDiaM: 25.0,
    minRoadWidthStraightM: 3.7,
  },
};

/**
 * Compute TURN_SCORE for a given road approach
 * Returns 0.0 (impassable) to 1.0 (fully safe)
 *
 * Alert thresholds:
 *   >= 0.75 → GREEN  — enter, you can turn
 *   0.40-0.74 → AMBER — warn 300m before
 *   < 0.40  → RED   — reroute 500m before
 */
export function computeTurnScore(params: {
  roadWidthM: number;
  hasTurningHead: boolean;
  roadLengthToEndM: number;
  vehicleProfile: VehicleProfile;
  communityScore?: number;  // 0.0–1.0 from driver reports, if available
  communityReportCount?: number;
}): number {
  const { roadWidthM, hasTurningHead, roadLengthToEndM, vehicleProfile, communityScore, communityReportCount = 0 } = params;

  let baseScore = Math.min(roadWidthM / vehicleProfile.minRoadWidthTurnM, 1.0);

  if (hasTurningHead) {
    baseScore = Math.min(baseScore + 0.30, 1.0);
  }

  if (roadLengthToEndM < 20) {
    baseScore *= 0.50; // very short dead-end, high reversal risk
  }

  if (communityReportCount > 0 && communityScore !== undefined) {
    return 0.60 * baseScore + 0.40 * communityScore;
  }

  return Math.max(0.0, Math.min(1.0, baseScore));
}

export type TurnAlert = 'GREEN' | 'AMBER' | 'RED';

export function getTurnAlert(score: number): TurnAlert {
  if (score >= 0.75) return 'GREEN';
  if (score >= 0.40) return 'AMBER';
  return 'RED';
}

export const TURN_ALERT_DISTANCES: Record<TurnAlert, number | null> = {
  GREEN: null,    // no warning needed
  AMBER: 300,     // warn 300m before approach
  RED: 500,       // reroute 500m before approach
};
