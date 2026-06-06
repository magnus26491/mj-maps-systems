/**
 * MJ Maps Systems — Route Optimisation Engine
 * Handles: stop ordering, LHD/RHD side-of-road logic, sharp turn scoring,
 * departure time optimisation, zone-based sweep routing
 */

import type { VehicleProfile } from '../../packages/vehicle-profiles/index';
import { getCongestionMultiplier, getTrafficProfile } from '../traffic-engine/index';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StopPoint {
  id: string;
  lat: number;
  lng: number;
  /** Confirmed property-level entrance coordinates (not postcode centroid) */
  entranceLat?: number;
  entranceLng?: number;
  address: string;
  /** Side of road the stop is on (L = left kerb, R = right kerb when driving forward) */
  sideOfRoad?: 'L' | 'R';
  /** Estimated service time in minutes */
  serviceTimeMin: number;
  /** Hard time window [open, close] in decimal hours */
  timeWindowOpen?: number;
  timeWindowClose?: number;
  /** Any height/weight restriction to reach this specific stop */
  accessHeightM?: number;
  accessWeightT?: number;
  notes?: string;
}

export interface RouteSegment {
  fromStop: string;
  toStop: string;
  distanceKm: number;
  durationMin: number;
  /** Whether the direction of travel keeps the next stop on the kerb side (no cross-traffic) */
  isKerbSideApproach: boolean;
  /** Sharp turn severity 0.0 (none) – 1.0 (tight hairpin) */
  sharpTurnSeverity: number;
  /** Whether this segment crosses a level crossing */
  hasCrossing: boolean;
  /** Estimated crossing delay in seconds */
  crossingDelaySec: number;
}

export type DriveHandedness = 'LHD' | 'RHD';

// ─── LHD / RHD KERB PREFERENCE ──────────────────────────────────────────────

/**
 * For a given drive handedness, determine the "preferred" stop side.
 *
 * RHD (UK, Ireland, Australia, Japan, India...):
 *   Driver sits on RIGHT. Kerb is on LEFT.
 *   Prefer stops on LEFT side of road — no need to cross traffic.
 *   At junctions, prefer LEFT turns — no cross-traffic exposure.
 *
 * LHD (EU, USA, Canada, China, most of the world):
 *   Driver sits on LEFT. Kerb is on RIGHT.
 *   Prefer stops on RIGHT side of road.
 *   At junctions, prefer RIGHT turns.
 */
export function getPreferredKerbSide(handedness: DriveHandedness): 'L' | 'R' {
  return handedness === 'RHD' ? 'L' : 'R';
}

/**
 * Score a stop approach for kerb-side efficiency
 * 1.0 = perfect (stop is on the kerb side, no cross-traffic)
 * 0.5 = neutral
 * 0.0 = worst (must cross oncoming traffic on a busy road)
 */
export function scoreKerbApproach(params: {
  stopSideOfRoad: 'L' | 'R';
  handedness: DriveHandedness;
  roadSpeedKmh: number;
  roadLanes: number;
}): number {
  const { stopSideOfRoad, handedness, roadSpeedKmh, roadLanes } = params;
  const preferred = getPreferredKerbSide(handedness);
  if (stopSideOfRoad === preferred) return 1.0;

  // Penalty scales with road speed and lane count (crossing is worse on faster roads)
  const speedPenalty = Math.min(roadSpeedKmh / 100, 0.4);
  const lanePenalty  = Math.min((roadLanes - 1) * 0.1, 0.3);
  return Math.max(0.0, 0.5 - speedPenalty - lanePenalty);
}

// ─── SHARP TURN SCORING ──────────────────────────────────────────────────────

export interface TurnGeometry {
  angleDeg: number;         // deviation from straight-ahead (0 = straight, 90 = right angle)
  roadWidthAtTurnM: number;
  isSignposted: boolean;
  surface: 'TARMAC' | 'GRAVEL' | 'COBBLE' | 'MUD';
}

/**
 * Score a turn for a given vehicle profile
 * 1.0 = easy  |  0.0 = impassable / dangerous
 */
export function sharpTurnScore(turn: TurnGeometry, vehicle: VehicleProfile): number {
  const angleNorm = Math.min(turn.angleDeg / 180, 1.0);

  // Width required to make the turn given vehicle wheelbase/radius
  const requiredWidth = vehicle.minRoadWidthTurnM * (1 + 0.3 * angleNorm);
  const widthScore    = Math.min(turn.roadWidthAtTurnM / requiredWidth, 1.0);

  // Surface penalty (mud/cobbles require extra clearance)
  const surfacePenalty = { TARMAC: 0, GRAVEL: 0.05, COBBLE: 0.10, MUD: 0.25 }[turn.surface];

  // Angle penalty for articulated vehicles (trailer swing)
  const articPenalty = vehicle.id.includes('artic') ? angleNorm * 0.20 : 0;

  const score = widthScore - surfacePenalty - articPenalty;
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Alert level for a sharp turn
 */
export function sharpTurnAlert(score: number): 'CLEAR' | 'CAUTION' | 'SLOW' | 'AVOID' {
  if (score >= 0.80) return 'CLEAR';
  if (score >= 0.55) return 'CAUTION';
  if (score >= 0.30) return 'SLOW';
  return 'AVOID';
}

// ─── VEHICLE HEIGHT ENTRY & VALIDATION ──────────────────────────────────────

export interface VehicleHeightEntry {
  vehicleProfileId: string;
  confirmedHeightM: number;
  /** Optional: payload that adds height (e.g. tall pallets on flatbed) */
  payloadHeightAddM?: number;
  confirmedAt: string; // ISO timestamp
  source: 'DRIVER_ENTRY' | 'FLEET_RECORD' | 'OBD_TELEMATICS';
}

/**
 * Validate a driver-entered height against the vehicle profile bounds
 * Returns validation result and effective routing height
 */
export function validateVehicleHeight(params: {
  entry: VehicleHeightEntry;
  profileHeightMinM: number;
  profileHeightMaxM: number;
}): { valid: boolean; effectiveHeightM: number; warning?: string } {
  const { entry, profileHeightMinM, profileHeightMaxM } = params;
  const effective = entry.confirmedHeightM + (entry.payloadHeightAddM ?? 0);

  // Allow ±200mm tolerance for measurement uncertainty
  const tolerance = 0.20;
  if (entry.confirmedHeightM < profileHeightMinM - tolerance) {
    return {
      valid: false,
      effectiveHeightM: effective,
      warning: `Entered height ${entry.confirmedHeightM}m is unusually low for this vehicle class. Please re-measure.`,
    };
  }
  if (entry.confirmedHeightM > profileHeightMaxM + tolerance) {
    return {
      valid: false,
      effectiveHeightM: effective,
      warning: `Entered height ${entry.confirmedHeightM}m exceeds maximum for this vehicle class. Verify measurement or select a different profile.`,
    };
  }
  return { valid: true, effectiveHeightM: effective };
}

// ─── ROUTE OPTIMISATION STRATEGY ────────────────────────────────────────────

/**
 * Core route optimisation parameters.
 * Passed to the route solver (OR-Tools / custom TSP/VRP engine).
 */
export interface OptimisationParams {
  stops: StopPoint[];
  depot: { lat: number; lng: number };
  vehicle: VehicleProfile;
  handedness: DriveHandedness;
  departureHour: number;
  /** Penalty weight for suboptimal kerb-side stops (0 = ignore, 1 = strong preference) */
  kerbSidePenaltyWeight: number;
  /** Penalty weight for crossing peaks / school zones */
  trafficAvoidanceWeight: number;
  /** Maximum route duration in hours */
  maxRouteDurationHours: number;
  /** Whether to optimise departure time within allowed window */
  optimiseDeparture: boolean;
  departureWindowStart?: number;
  departureWindowEnd?: number;
}

/**
 * Sweep zone algorithm: group stops by compass sector around depot,
 * order within each sector by distance, then order sectors to avoid backtracking.
 * LHD/RHD awareness: prefer sector ordering that minimises cross-traffic.
 *
 * Based on Clarke-Wright Savings algorithm with handedness modifier
 */
export function sweepZoneOrder(
  stops: StopPoint[],
  depot: { lat: number; lng: number },
  handedness: DriveHandedness
): StopPoint[] {
  // Calculate bearing from depot to each stop
  const withBearing = stops.map((stop) => {
    const dLng = stop.lng - depot.lng;
    const dLat = stop.lat - depot.lat;
    const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    const normBearing = (bearing + 360) % 360;
    return { stop, bearing: normBearing };
  });

  // For RHD (UK): sweep clockwise (left turns preferred, stays on left side)
  // For LHD (EU): sweep anticlockwise (right turns preferred, stays on right side)
  const sorted = withBearing.sort((a, b) =>
    handedness === 'RHD'
      ? a.bearing - b.bearing   // clockwise sweep
      : b.bearing - a.bearing   // anticlockwise sweep
  );

  return sorted.map((s) => s.stop);
}
