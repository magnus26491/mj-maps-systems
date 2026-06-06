/**
 * Turn Engine — core scoring logic
 *
 * Takes a RoadGeometry + VehicleProfile and returns a TurnScoreResult.
 *
 * Scoring formula:
 *
 *   base  = clamp(roadWidth / vehicle.minRoadWidthTurn, 0, 1)
 *   bonus = +0.20 if turning head present
 *   bonus = +0.10 if passing place present
 *   penalty = ×0.50 if dead-end AND depth < vehicle.minReverseDepthM
 *   penalty = ×0.70 if one-way (limits turn options)
 *   hard cap = 0.0 if maxWidthM < vehicle.widthM
 *   hard cap = 0.0 if maxHeightM < vehicle.heightM
 *   hard cap = 0.0 if maxWeightT < vehicle.weightT
 *
 * Alert thresholds: GREEN ≥ 0.75 | AMBER 0.40–0.74 | RED < 0.40
 */
import type { RoadGeometry, TurnScoreResult, VehicleProfile, AlertLevel } from './types';

const ALERT_GREEN_THRESHOLD = 0.75;
const ALERT_AMBER_THRESHOLD = 0.40;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function scoreTurn(
  road: RoadGeometry,
  vehicle: VehicleProfile,
): TurnScoreResult {
  const now = Date.now();

  // ── Hard restriction checks ──────────────────────────────────────────────
  if (road.maxWidthM !== null && road.maxWidthM < vehicle.widthM) {
    return {
      score: 0,
      alert: 'RED',
      reason: `Width restriction ${road.maxWidthM}m — vehicle is ${vehicle.widthM}m wide`,
      roadWidthM: road.widthM,
      source: road.source,
      cachedAt: now,
    };
  }

  if (road.maxHeightM !== null && road.maxHeightM < vehicle.heightM) {
    return {
      score: 0,
      alert: 'RED',
      reason: `Height restriction ${road.maxHeightM}m — vehicle is ${vehicle.heightM}m tall`,
      roadWidthM: road.widthM,
      source: road.source,
      cachedAt: now,
    };
  }

  if (road.maxWeightT !== null && road.maxWeightT < vehicle.weightT) {
    return {
      score: 0,
      alert: 'RED',
      reason: `Weight restriction ${road.maxWeightT}t — vehicle is ${vehicle.weightT}t`,
      roadWidthM: road.widthM,
      source: road.source,
      cachedAt: now,
    };
  }

  // ── Base score from road width ───────────────────────────────────────────
  let score: number;
  let reason: string | null = null;

  if (road.widthM === null) {
    // Unknown width — fall back to highway class heuristic
    score = highwayClassFallback(road.highwayClass);
    reason = score < ALERT_GREEN_THRESHOLD
      ? `Road width unknown — estimated from road type (${road.highwayClass ?? 'unknown'})`
      : null;
  } else {
    score = clamp(road.widthM / vehicle.minRoadWidthTurn, 0, 1);
  }

  // ── Bonuses ──────────────────────────────────────────────────────────────
  if (road.hasTurningHead)  score = clamp(score + 0.20, 0, 1);
  if (road.hasPassingPlace) score = clamp(score + 0.10, 0, 1);

  // ── Penalties ────────────────────────────────────────────────────────────
  if (road.isOneWay) {
    score *= 0.70;
    reason = reason ?? 'One-way road — turn options limited';
  }

  if (road.isDeadEnd && road.deadEndDepthM < vehicle.minReverseDepthM) {
    score *= 0.50;
    reason = `Dead end too short to reverse — need ${vehicle.minReverseDepthM}m, only ${road.deadEndDepthM}m available`;
  }

  score = clamp(score, 0, 1);

  // ── Alert level ──────────────────────────────────────────────────────────
  let alert: AlertLevel;
  if (score >= ALERT_GREEN_THRESHOLD) {
    alert = 'GREEN';
    reason = null;
  } else if (score >= ALERT_AMBER_THRESHOLD) {
    alert = 'AMBER';
    reason = reason ?? buildAmberReason(road, vehicle);
  } else {
    alert = 'RED';
    reason = reason ?? buildRedReason(road, vehicle);
  }

  return {
    score: Math.round(score * 100) / 100,
    alert,
    reason,
    roadWidthM: road.widthM,
    source: road.source,
    cachedAt: now,
  };
}

// ── Highway class fallback widths (metres, kerb-to-kerb estimates) ──────────
const HIGHWAY_CLASS_WIDTH: Record<string, number> = {
  motorway:        14.0,
  trunk:           10.0,
  primary:          8.0,
  secondary:        7.0,
  tertiary:         6.0,
  unclassified:     5.5,
  residential:      5.5,
  service:          4.5,
  track:            3.5,
  footway:          2.0,
  path:             1.5,
};

function highwayClassFallback(cls: string | null): number {
  if (!cls) return 0.50; // total unknown — AMBER
  const width = HIGHWAY_CLASS_WIDTH[cls] ?? 5.0;
  return clamp(width / 7.0, 0, 1); // normalise against 7m baseline
}

function buildAmberReason(road: RoadGeometry, vehicle: VehicleProfile): string {
  if (road.widthM !== null && road.widthM < vehicle.minRoadWidthTurn) {
    return `Road ${road.widthM}m wide — ${vehicle.label} needs ${vehicle.minRoadWidthTurn}m to turn`;
  }
  return `Tight turning conditions for ${vehicle.label} — proceed with caution`;
}

function buildRedReason(road: RoadGeometry, vehicle: VehicleProfile): string {
  if (road.widthM !== null) {
    return `Road ${road.widthM}m wide — ${vehicle.label} cannot safely turn (needs ${vehicle.minRoadWidthTurn}m)`;
  }
  return `Road too narrow for ${vehicle.label} — do not enter`;
}
