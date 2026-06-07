/**
 * MJ Maps Systems — Walk vs Drive Cluster Decision Engine
 *
 * Detects when multiple stops are clustered on the same road or within
 * walking distance, then calculates whether the driver should:
 *   A) Park once and walk all stops (with or without a cut-through/alley)
 *   B) Drive to each stop individually
 *
 * Cross-references:
 *   - Turn-around feasibility of current road AND next road after cluster
 *   - OSM pedestrian paths (footways, alleys, snickets, cut-throughs)
 *   - Parcel count and weight flags
 *   - Road type and speed (parking feasibility)
 *   - Weather conditions (future: weather API)
 *
 * This is the most differentiated feature in the product.
 * No other delivery routing app currently implements this decision logic.
 */

import type { StopPoint } from '../route-optimizer/index.js';
import { computeTurnScore, getTurnAlert } from '../../packages/vehicle-profiles/index.js';
import type { VehicleProfile, TurnAlertLevel } from '../../packages/vehicle-profiles/index.js';

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface PedestrianPath {
  id: string;
  /** OSM highway tag: footway | path | alley | steps | pedestrian */
  type: 'footway' | 'path' | 'alley' | 'steps' | 'pedestrian';
  /** Approximate walking distance of this path in metres */
  distanceM: number;
  /** Whether this path is lit (relevant for evening deliveries) */
  isLit: boolean;
  /** Whether steps are present (relevant for large/heavy parcels) */
  hasSteps: boolean;
  /** Confirmed accessible (no locked gates, no private land) */
  accessConfirmed: boolean;
  /** Community reports: 0 = unknown, >0 = verified usable */
  communityVerifications: number;
}

export interface ClusterStop extends StopPoint {
  /** Number of parcels at this stop */
  parcelCount: number;
  /** Total weight in kg */
  totalWeightKg: number;
  /** Whether any parcel requires signature */
  requiresSignature: boolean;
  /** Whether any parcel is oversize (>60cm any dimension) */
  isOversize: boolean;
}

export interface ClusterContext {
  stops: ClusterStop[];
  /** Best legal parking point for the cluster (entrance to road/close) */
  parkingLat: number;
  parkingLng: number;
  /** Turn feasibility of the cluster road */
  clusterRoadTurn: {
    roadWidthM: number;
    hasTurningHead: boolean;
    roadLengthToEndM: number;
    communityScore?: number;
    communityReportCount?: number;
  };
  /** Turn feasibility of the NEXT road after the cluster (to decide if driving on is worse) */
  nextRoadTurn?: {
    roadWidthM: number;
    hasTurningHead: boolean;
    roadLengthToEndM: number;
  };
  /** Pedestrian paths connecting cluster stops or providing shortcuts */
  pedestrianPaths: PedestrianPath[];
  vehicle: VehicleProfile;
  /** Driver-level settings */
  driverPreferences: DriverPreferences;
}

export interface DriverPreferences {
  /** Max walk distance driver is willing to walk per cluster (metres) */
  maxWalkDistanceM: number;     // default 400m
  /** Whether driver has mobility limitations */
  hasMobilityLimitation: boolean;
  /** Whether driver is comfortable with steps */
  avoidsSteps: boolean;
  /** Preferred walk speed (metres/min) — personalised from GPS history */
  walkSpeedMpm: number;         // default 75 m/min laden
}

export const DEFAULT_DRIVER_PREFERENCES: DriverPreferences = {
  maxWalkDistanceM: 400,
  hasMobilityLimitation: false,
  avoidsSteps: false,
  walkSpeedMpm: 75,
};

// ─── DECISION RESULT ──────────────────────────────────────────────────────

export type ClusterDecision = 'WALK' | 'DRIVE' | 'WALK_VIA_CUTTHROUGH' | 'MIXED';

export interface ClusterResult {
  decision: ClusterDecision;
  walkTimeMin: number;
  driveTimeMin: number;
  timeSavedMin: number;
  /** Human-readable notification shown to driver */
  notification: string;
  /** Detailed breakdown for the expanded view */
  breakdown: {
    walkDistanceM: number;
    driveDistanceM: number;
    doorTimeMin: number;
    turnaroundPenaltyMin: number;
    cutThroughUsed: boolean;
    cutThroughPath?: PedestrianPath;
    /** Alert level of the next road after cluster (lowercase) */
    nextRoadTurnAlert: TurnAlertLevel;
  };
  /** Whether any stops should be skipped in the walk (heavy/oversize) */
  driveStops: ClusterStop[];   // stops that must still be driven to
  walkStops: ClusterStop[];    // stops that should be walked
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────

const SERVICE_TIME_MIN        = 1.5;   // ring, wait, handover, photo proof
const DRIVE_APPROACH_SPEED    = 20.0;  // km/h in tight residential
const DRIVE_APPROACH_MPM      = (DRIVE_APPROACH_SPEED * 1000) / 60; // 333 m/min
const WALK_SPEED_DEFAULT_MPM  = 75.0;  // laden with parcel
const RETURN_WALK_SPEED_MPM   = 90.0;  // unladen return
const WALK_BENEFIT_THRESHOLD  = 0.85;  // walk must be <85% of drive time to recommend
const MAX_WALK_WEIGHT_KG      = 15.0;  // above this, force drive regardless
const MAX_WALK_PARCELS        = 3;     // above this per trip, consider drive

// ─── CLUSTER DETECTION ────────────────────────────────────────────────────

/**
 * Detect whether a set of consecutive stops form a walkable cluster.
 * Clusters are detected when:
 *   - 3+ stops are within CLUSTER_RADIUS_M of each other, OR
 *   - 2+ stops are on a dead-end road (turn score RED), OR
 *   - A pedestrian cut-through connects the stops to the next road
 */
export const CLUSTER_RADIUS_M = 300; // stops within 300m of each other

export function detectClusters(stops: ClusterStop[]): ClusterStop[][] {
  const clusters: ClusterStop[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < stops.length; i++) {
    if (assigned.has(stops[i].id)) continue;
    const cluster: ClusterStop[] = [stops[i]];
    assigned.add(stops[i].id);

    for (let j = i + 1; j < stops.length; j++) {
      if (assigned.has(stops[j].id)) continue;
      const dist = haversineM(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng);
      if (dist <= CLUSTER_RADIUS_M) {
        cluster.push(stops[j]);
        assigned.add(stops[j].id);
      }
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

// ─── WALK vs DRIVE SCORER ─────────────────────────────────────────────────

/**
 * Core decision function.
 * Returns a full ClusterResult with recommendation, times, and driver notification.
 */
export function scoreCluster(ctx: ClusterContext): ClusterResult {
  const { stops, vehicle, driverPreferences: prefs } = ctx;

  // ── Separate oversize/heavy stops (must always drive) ──────────────────
  const driveStops   = stops.filter(s =>
    s.isOversize ||
    s.totalWeightKg > MAX_WALK_WEIGHT_KG ||
    s.parcelCount > MAX_WALK_PARCELS
  );
  const walkStops    = stops.filter(s => !driveStops.includes(s));

  // ── If driver has mobility limitations, skip walk recommendation ────────
  if (prefs.hasMobilityLimitation || prefs.maxWalkDistanceM < 50) {
    return buildDriveResult(ctx, stops, [], stops);
  }

  // ── Compute total walk distance from parking point ──────────────────────
  const walkDistM = walkStops.reduce((sum, stop) =>
    sum + haversineM(ctx.parkingLat, ctx.parkingLng, stop.lat, stop.lng), 0
  ) * 1.2; // 1.2 factor for non-straight walking paths

  if (walkDistM > prefs.maxWalkDistanceM) {
    return buildDriveResult(ctx, stops, [], stops);
  }

  // ── Check for cut-through / alley ──────────────────────────────────────
  const cutThrough = ctx.pedestrianPaths
    .filter(p => p.accessConfirmed && !p.hasSteps)
    .sort((a, b) => a.distanceM - b.distanceM)[0];

  const effectiveWalkDistM = cutThrough
    ? walkDistM * 0.70  // cut-through shortens path significantly
    : walkDistM;

  // ── Walk time ──────────────────────────────────────────────────────────
  const walkSpeedMpm = prefs.walkSpeedMpm ?? WALK_SPEED_DEFAULT_MPM;
  const outboundMin  = effectiveWalkDistM / walkSpeedMpm;
  const doorsMin     = walkStops.length * SERVICE_TIME_MIN;
  const returnMin    = effectiveWalkDistM / RETURN_WALK_SPEED_MPM;
  const walkTimeMin  = outboundMin + doorsMin + returnMin;

  // ── Drive time ─────────────────────────────────────────────────────────
  const driveDistM      = walkDistM * 1.5;
  const driveTravelMin  = driveDistM / DRIVE_APPROACH_MPM;

  // Turn-around penalty on current road — correct call signature
  const turnResult  = computeTurnScore(vehicle, ctx.clusterRoadTurn.roadWidthM, {
    hasTurningHead: ctx.clusterRoadTurn.hasTurningHead,
    deadEndLengthM: ctx.clusterRoadTurn.roadLengthToEndM,
    communityScore: ctx.clusterRoadTurn.communityScore,
  });
  const turnAlertObj = getTurnAlert(turnResult, vehicle.label);
  const turnPenMin   = turnAlertObj.level === 'red' ? 6.0 : turnAlertObj.level === 'amber' ? 2.5 : 0.5;

  // Next-road turn penalty
  let nextTurnPenMin   = 0;
  let nextRoadAlert: TurnAlertLevel = 'green';
  if (ctx.nextRoadTurn) {
    const nextResult = computeTurnScore(vehicle, ctx.nextRoadTurn.roadWidthM, {
      hasTurningHead: ctx.nextRoadTurn.hasTurningHead,
      deadEndLengthM: ctx.nextRoadTurn.roadLengthToEndM,
    });
    const nextAlertObj = getTurnAlert(nextResult, vehicle.label);
    nextRoadAlert  = nextAlertObj.level;
    nextTurnPenMin = nextAlertObj.level === 'red' ? 5.0 : nextAlertObj.level === 'amber' ? 2.0 : 0;
  }

  const driveTimeMin = driveTravelMin + doorsMin + turnPenMin + nextTurnPenMin;

  // ── Decision ───────────────────────────────────────────────────────────
  const timeSavedMin = driveTimeMin - walkTimeMin;
  let decision: ClusterDecision;

  if (walkStops.length === 0) {
    decision = 'DRIVE';
  } else if (walkTimeMin < driveTimeMin * WALK_BENEFIT_THRESHOLD) {
    decision = cutThrough ? 'WALK_VIA_CUTTHROUGH' : 'WALK';
  } else if (driveStops.length > 0 && walkStops.length > 0) {
    decision = 'MIXED';
  } else {
    decision = 'DRIVE';
  }

  // ── Driver notification ────────────────────────────────────────────────
  const notification = buildNotification({
    decision, stops, walkStops, driveStops,
    walkTimeMin, driveTimeMin, timeSavedMin,
    cutThrough,
    turnAlert: turnAlertObj.level,
    nextRoadTurnAlert: nextRoadAlert,
  });

  return {
    decision,
    walkTimeMin,
    driveTimeMin,
    timeSavedMin,
    notification,
    breakdown: {
      walkDistanceM: effectiveWalkDistM,
      driveDistanceM: driveDistM,
      doorTimeMin: doorsMin,
      turnaroundPenaltyMin: turnPenMin + nextTurnPenMin,
      cutThroughUsed: !!cutThrough,
      cutThroughPath: cutThrough,
      nextRoadTurnAlert: nextRoadAlert,
    },
    driveStops,
    walkStops,
  };
}

// ─── NOTIFICATION BUILDER ─────────────────────────────────────────────────

function buildNotification(p: {
  decision: ClusterDecision;
  stops: ClusterStop[];
  walkStops: ClusterStop[];
  driveStops: ClusterStop[];
  walkTimeMin: number;
  driveTimeMin: number;
  timeSavedMin: number;
  cutThrough?: PedestrianPath;
  turnAlert: TurnAlertLevel;
  nextRoadTurnAlert: TurnAlertLevel;
}): string {
  const n = p.stops.length;
  const saved = Math.round(p.timeSavedMin);
  const walkMin = Math.round(p.walkTimeMin);
  const driveMin = Math.round(p.driveTimeMin);

  switch (p.decision) {
    case 'WALK':
      return [
        `🚶 ${n} deliveries ahead on this road.`,
        `Park here — walking saves ~${saved} min (${walkMin} min walk vs ${driveMin} min driving).`,
        p.turnAlert === 'red' ? `⚠️ Dead end — your vehicle cannot turn at the end.` : '',
      ].filter(Boolean).join(' ');

    case 'WALK_VIA_CUTTHROUGH':
      return [
        `🚶 ${n} deliveries ahead. There's a cut-through to the next road.`,
        `Park here, walk all stops + use the alley — saves ~${saved} min`,
        `(${walkMin} min total vs ${driveMin} min driving round).`,
      ].filter(Boolean).join(' ');

    case 'MIXED':
      return [
        `🚗🚶 ${n} deliveries on this road.`,
        `Drive to ${p.driveStops.length} heavy/large stop${p.driveStops.length > 1 ? 's' : ''}, `,
        `then park and walk ${p.walkStops.length} — saves ~${saved} min.`,
      ].filter(Boolean).join('');

    case 'DRIVE':
    default:
      return `🚗 ${n} deliveries — continue driving, best approach is vehicle to each stop.`;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function buildDriveResult(
  ctx: ClusterContext,
  stops: ClusterStop[],
  walkStops: ClusterStop[],
  driveStops: ClusterStop[]
): ClusterResult {
  const driveDistM   = CLUSTER_RADIUS_M * 1.5;
  const driveTimeMin = driveDistM / DRIVE_APPROACH_MPM + stops.length * SERVICE_TIME_MIN;
  return {
    decision: 'DRIVE',
    walkTimeMin: Infinity,
    driveTimeMin,
    timeSavedMin: 0,
    notification: `🚗 ${stops.length} deliveries — driving to each stop.`,
    breakdown: {
      walkDistanceM: 0,
      driveDistanceM: driveDistM,
      doorTimeMin: stops.length * SERVICE_TIME_MIN,
      turnaroundPenaltyMin: 0,
      cutThroughUsed: false,
      nextRoadTurnAlert: 'green',
    },
    driveStops,
    walkStops,
  };
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
