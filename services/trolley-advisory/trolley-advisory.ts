/**
 * MJ Maps Systems — Trolley Advisory Engine
 *
 * Determines whether the driver should use a sack trolley / pump truck
 * for a delivery, based on:
 *  - Parcel weight (kg)
 *  - Parcel dimensions (if known)
 *  - Estimated walk distance from parking to front door (metres)
 *  - Floor number (from building intelligence)
 *  - Lift availability
 *  - Number of parcels for this stop
 *
 * Advisory levels:
 *  NONE       — no trolley needed
 *  SUGGESTED  — trolley recommended but not critical
 *  REQUIRED   — trolley strongly advised (heavy + long walk / stairs)
 *
 * Used by: stop-intelligence.ts, driver stop card
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type TrolleyAdvisoryLevel = 'NONE' | 'SUGGESTED' | 'REQUIRED';

export interface ParcelSpec {
  /** Weight in kg */
  weightKg: number;
  /** Optional: longest dimension in cm */
  lengthCm?: number;
  /** Optional: number of parcels at this stop */
  parcelCount?: number;
}

export interface TrolleyAdvisoryInput {
  parcel: ParcelSpec;
  /** Walk distance from parking to front door in metres */
  walkDistanceM: number;
  /** Floor number (0 = ground) */
  floorNumber?: number;
  /** Whether a lift is available */
  liftAvailable?: boolean;
  /** Whether there are steps at the entrance */
  hasSteps?: boolean;
}

export interface TrolleyAdvisory {
  level: TrolleyAdvisoryLevel;
  /** Short message shown on driver stop card */
  message: string;
  /** Score 0–100 used to derive the level (for debugging / logging) */
  score: number;
  /** Breakdown of which factors contributed to the score */
  factors: string[];
}

// ─── SCORING CONSTANTS ───────────────────────────────────────────────────────

const THRESHOLDS = {
  WEIGHT_SUGGESTED_KG:  15,   // Above this → starts scoring
  WEIGHT_REQUIRED_KG:   25,   // Above this alone → REQUIRED
  WALK_SUGGESTED_M:     30,   // Walk distance that starts adding score
  WALK_REQUIRED_M:      80,   // Walk above this → adds significant score
  PARCEL_COUNT_MULTI:    3,   // 3+ parcels → adds score
  FLOOR_PER_LEVEL:       8,   // Score per floor above ground
  SCORE_SUGGESTED:      35,   // Threshold for SUGGESTED
  SCORE_REQUIRED:       65,   // Threshold for REQUIRED
} as const;

// ─── SCORE CALCULATOR ────────────────────────────────────────────────────────

/**
 * Compute a 0–100 trolley necessity score.
 * Higher = more trolley-worthy.
 */
function computeTrolleyScore(input: TrolleyAdvisoryInput): { score: number; factors: string[] } {
  const { parcel, walkDistanceM, floorNumber = 0, liftAvailable = true, hasSteps = false } = input;
  const factors: string[] = [];
  let score = 0;

  // ── Weight ────────────────────────────────────────────────────────────────
  if (parcel.weightKg >= THRESHOLDS.WEIGHT_REQUIRED_KG) {
    score += 50;
    factors.push(`Heavy parcel (${parcel.weightKg}kg)`);
  } else if (parcel.weightKg >= THRESHOLDS.WEIGHT_SUGGESTED_KG) {
    const weightScore = ((parcel.weightKg - THRESHOLDS.WEIGHT_SUGGESTED_KG) /
      (THRESHOLDS.WEIGHT_REQUIRED_KG - THRESHOLDS.WEIGHT_SUGGESTED_KG)) * 30;
    score += weightScore;
    factors.push(`Parcel weight ${parcel.weightKg}kg`);
  }

  // ── Walk distance ─────────────────────────────────────────────────────────
  if (walkDistanceM >= THRESHOLDS.WALK_REQUIRED_M) {
    score += 25;
    factors.push(`Long walk to door (${walkDistanceM}m)`);
  } else if (walkDistanceM >= THRESHOLDS.WALK_SUGGESTED_M) {
    const walkScore = ((walkDistanceM - THRESHOLDS.WALK_SUGGESTED_M) /
      (THRESHOLDS.WALK_REQUIRED_M - THRESHOLDS.WALK_SUGGESTED_M)) * 15;
    score += walkScore;
    factors.push(`Walk to door ${walkDistanceM}m`);
  }

  // ── Floor / stairs ────────────────────────────────────────────────────────
  if (floorNumber > 0) {
    if (!liftAvailable) {
      // Stairs only — significant multiplier
      const stairScore = floorNumber * THRESHOLDS.FLOOR_PER_LEVEL * 1.5;
      score += Math.min(stairScore, 30);
      factors.push(`Floor ${floorNumber} — no lift (stairs only)`);
    } else {
      // Lift available — still needs trolley to get to lift
      const liftScore = floorNumber * THRESHOLDS.FLOOR_PER_LEVEL * 0.5;
      score += Math.min(liftScore, 15);
      factors.push(`Floor ${floorNumber} (lift available)`);
    }
  }

  // ── Steps at entrance ─────────────────────────────────────────────────────
  if (hasSteps) {
    score += 5;
    factors.push('Steps at entrance');
  }

  // ── Multiple parcels ──────────────────────────────────────────────────────
  const count = parcel.parcelCount ?? 1;
  if (count >= THRESHOLDS.PARCEL_COUNT_MULTI) {
    const multiScore = Math.min((count - 2) * 8, 20);
    score += multiScore;
    factors.push(`${count} parcels at this stop`);
  }

  // ── Long parcel (awkward to carry) ────────────────────────────────────────
  if (parcel.lengthCm && parcel.lengthCm >= 100) {
    score += 10;
    factors.push(`Long parcel (${parcel.lengthCm}cm)`);
  }

  return { score: Math.min(Math.round(score), 100), factors };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Generate a trolley advisory for a delivery stop.
 *
 * @example
 * // 28kg parcel, 65m walk, 2nd floor, no lift
 * const advisory = getTrolleyAdvisory({
 *   parcel: { weightKg: 28, parcelCount: 1 },
 *   walkDistanceM: 65,
 *   floorNumber: 2,
 *   liftAvailable: false,
 * });
 * // advisory.level   → 'REQUIRED'
 * // advisory.message → '🛒 Use trolley — heavy parcel, 65m walk, floor 2 (no lift)'
 */
export function getTrolleyAdvisory(input: TrolleyAdvisoryInput): TrolleyAdvisory {
  const { score, factors } = computeTrolleyScore(input);

  let level: TrolleyAdvisoryLevel;
  let message: string;

  if (score >= THRESHOLDS.SCORE_REQUIRED) {
    level = 'REQUIRED';
    const reason = factors.slice(0, 2).join(', ').toLowerCase();
    message = `🛒 Use trolley — ${reason}`;
  } else if (score >= THRESHOLDS.SCORE_SUGGESTED) {
    level = 'SUGGESTED';
    const reason = factors[0]?.toLowerCase() ?? 'heavy or bulky parcel';
    message = `🛒 Trolley recommended — ${reason}`;
  } else {
    level = 'NONE';
    message = '';
  }

  return { level, message, score, factors };
}

/**
 * Convenience: get advisory directly from flat params.
 * Useful when you already have the values and don't want to build the input object.
 */
export function getTrolleyAdvisoryFlat(
  weightKg: number,
  walkDistanceM: number,
  floorNumber = 0,
  liftAvailable = true,
  parcelCount = 1,
  lengthCm?: number,
  hasSteps = false,
): TrolleyAdvisory {
  return getTrolleyAdvisory({
    parcel: { weightKg, parcelCount, lengthCm },
    walkDistanceM,
    floorNumber,
    liftAvailable,
    hasSteps,
  });
}

// ─── BATCH ───────────────────────────────────────────────────────────────────

export interface StopTrolleyInput {
  stopId: string;
  input: TrolleyAdvisoryInput;
}

/**
 * Batch compute trolley advisories for all stops on a route.
 * Synchronous — no I/O required.
 */
export function getTrolleyAdvisoryBatch(
  stops: StopTrolleyInput[],
): Map<string, TrolleyAdvisory> {
  const results = new Map<string, TrolleyAdvisory>();
  for (const { stopId, input } of stops) {
    results.set(stopId, getTrolleyAdvisory(input));
  }
  return results;
}
