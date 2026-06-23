/**
 * MJ Maps Systems — Trolley Advisory Engine (Driver-Triggered)
 *
 * IMPORTANT DESIGN DECISION:
 * The app does NOT pre-compute trolley advisories at route build time.
 * Only the driver knows whether a parcel is heavy — the app has no weight data.
 *
 * Instead, the driver interacts with the stop card:
 *   - Taps "Heavy parcel" toggle (>15kg estimate), OR
 *   - Enters an approximate weight if shown on the label
 *
 * The advisory is then computed CLIENT-SIDE instantly from:
 *   1. Driver-provided weight signal (heavy toggle OR kg input)
 *   2. Walk distance from parking to front door (from parking engine — known)
 *   3. Floor number (from building intelligence — known)
 *   4. Lift availability (from building intelligence — known)
 *   5. Parcel count at this stop (from route data — known)
 *
 * This keeps the advisory accurate and driver-owned rather than wrong and automated.
 *
 * Used by: driver app stop card (client-side, no server round-trip needed)
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type TrolleyAdvisoryLevel = 'NONE' | 'SUGGESTED' | 'REQUIRED';

/**
 * Input provided by the DRIVER at the point of delivery.
 * weightKg is optional — driver may just tap "heavy" toggle without entering a number.
 * When weightKg is omitted, the advisory uses the heavyToggle as a boolean signal.
 */
export interface DriverWeightInput {
  /** Driver tapped the "Heavy parcel" toggle */
  heavyToggle: boolean;
  /** Optional: driver read the weight label and entered it (kg) */
  weightKg?: number;
  /** Number of parcels at this stop — from route data, NOT driver input */
  parcelCount: number;
}

/**
 * Context known by the app at stop time — populated from stop intelligence.
 * These are server-computed values, not driver inputs.
 */
export interface StopContext {
  /** Walk distance from parking spot to front door (metres) — from parking engine */
  walkDistanceM: number;
  /** Floor number (0 = ground) — from building intelligence */
  floorNumber: number;
  /** Whether a lift is available — from building intelligence */
  liftAvailable: boolean;
  /** Whether there are steps at the entrance — from building intelligence */
  hasSteps: boolean;
}

export interface TrolleyAdvisory {
  level: TrolleyAdvisoryLevel;
  /** Short message shown on driver stop card */
  message: string;
  /** Score 0–100 — for logging/debugging only, not shown to driver */
  score: number;
  /** Human-readable factors that drove the score */
  factors: string[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const T = {
  // Weight
  HEAVY_TOGGLE_SCORE:   40,  // Points added when driver taps "heavy" without a kg value
  WEIGHT_REQUIRED_KG:   25,  // Above this → max weight score
  WEIGHT_SUGGESTED_KG:  15,  // Above this → starts scoring
  WEIGHT_MAX_SCORE:     50,

  // Walk distance (known from parking engine)
  WALK_SUGGESTED_M:     30,
  WALK_REQUIRED_M:      80,
  WALK_MAX_SCORE:       25,

  // Floor / stairs (known from building intelligence)
  FLOOR_PER_LEVEL_LIFT: 4,   // pts per floor when lift available
  FLOOR_PER_LEVEL_STAIR:10,  // pts per floor when no lift
  FLOOR_MAX_SCORE:      30,

  // Steps
  STEPS_SCORE:          5,

  // Multiple parcels (known from route data)
  MULTI_PARCEL_BASE:    3,   // 3+ parcels starts scoring
  MULTI_PARCEL_PER:     8,   // pts per parcel above 2
  MULTI_MAX_SCORE:      20,

  // Advisory thresholds
  SCORE_SUGGESTED:      35,
  SCORE_REQUIRED:       65,
} as const;

// ─── CORE SCORER ───────────────────────────────────────────────────────────────

function score(driver: DriverWeightInput, ctx: StopContext): { score: number; factors: string[] } {
  const factors: string[] = [];
  let s = 0;

  // ─ Weight signal (driver-provided) ──────────────────────────────────────────────
  if (driver.weightKg !== undefined) {
    // Driver entered exact kg — use precise scoring
    if (driver.weightKg >= T.WEIGHT_REQUIRED_KG) {
      s += T.WEIGHT_MAX_SCORE;
      factors.push(`Heavy parcel (${driver.weightKg}kg)`);
    } else if (driver.weightKg >= T.WEIGHT_SUGGESTED_KG) {
      const ws = ((driver.weightKg - T.WEIGHT_SUGGESTED_KG) /
        (T.WEIGHT_REQUIRED_KG - T.WEIGHT_SUGGESTED_KG)) * T.WEIGHT_MAX_SCORE;
      s += ws;
      factors.push(`Parcel ${driver.weightKg}kg`);
    }
  } else if (driver.heavyToggle) {
    // Driver tapped "heavy" toggle without entering kg — use flat score
    s += T.HEAVY_TOGGLE_SCORE;
    factors.push('Heavy parcel (driver confirmed)');
  } else {
    // Driver has NOT indicated heavy — short-circuit: never advise trolley
    // Walk distance and floor still count for multi-parcel scenarios
  }

  // If driver hasn't flagged heavy AND it's a single parcel — no advisory
  if (!driver.heavyToggle && driver.weightKg === undefined && driver.parcelCount < T.MULTI_PARCEL_BASE) {
    return { score: 0, factors: [] };
  }

  // ─ Walk distance (app-known) ────────────────────────────────────────────────
  if (ctx.walkDistanceM >= T.WALK_REQUIRED_M) {
    s += T.WALK_MAX_SCORE;
    factors.push(`Long walk (${ctx.walkDistanceM}m to door)`);
  } else if (ctx.walkDistanceM >= T.WALK_SUGGESTED_M) {
    const ws = ((ctx.walkDistanceM - T.WALK_SUGGESTED_M) /
      (T.WALK_REQUIRED_M - T.WALK_SUGGESTED_M)) * T.WALK_MAX_SCORE;
    s += ws;
    if (ws > 5) factors.push(`Walk to door ${ctx.walkDistanceM}m`);
  }

  // ─ Floor / stairs (app-known) ─────────────────────────────────────────────
  if (ctx.floorNumber > 0) {
    const perLevel = ctx.liftAvailable ? T.FLOOR_PER_LEVEL_LIFT : T.FLOOR_PER_LEVEL_STAIR;
    const fs = Math.min(ctx.floorNumber * perLevel, T.FLOOR_MAX_SCORE);
    s += fs;
    const liftNote = ctx.liftAvailable ? 'lift available' : 'no lift — stairs only';
    factors.push(`Floor ${ctx.floorNumber} (${liftNote})`);
  }

  if (ctx.hasSteps) {
    s += T.STEPS_SCORE;
    factors.push('Steps at entrance');
  }

  // ─ Multiple parcels (app-known) ────────────────────────────────────────────
  if (driver.parcelCount >= T.MULTI_PARCEL_BASE) {
    const ms = Math.min((driver.parcelCount - 2) * T.MULTI_PARCEL_PER, T.MULTI_MAX_SCORE);
    s += ms;
    factors.push(`${driver.parcelCount} parcels at this stop`);
  }

  return { score: Math.min(Math.round(s), 100), factors };
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────────

/**
 * Compute trolley advisory when driver interacts with the stop card.
 *
 * Called client-side (no server round-trip) when:
 *   - Driver taps "Heavy parcel" toggle
 *   - Driver enters a weight
 *   - Stop card first renders (to check multi-parcel threshold)
 *
 * @example
 * // Driver taps heavy toggle, 2nd floor, no lift, 65m walk
 * getTrolleyAdvisory(
 *   { heavyToggle: true, parcelCount: 1 },
 *   { walkDistanceM: 65, floorNumber: 2, liftAvailable: false, hasSteps: false }
 * );
 * // → { level: 'REQUIRED', message: '🛒 Use trolley — heavy parcel, floor 2 (no lift — stairs only)' }
 *
 * @example
 * // Driver does NOT tap heavy, single parcel — no advisory ever shown
 * getTrolleyAdvisory(
 *   { heavyToggle: false, parcelCount: 1 },
 *   { walkDistanceM: 200, floorNumber: 5, liftAvailable: false, hasSteps: true }
 * );
 * // → { level: 'NONE', message: '' }
 */
export function getTrolleyAdvisory(
  driver: DriverWeightInput,
  ctx: StopContext,
): TrolleyAdvisory {
  const { score: s, factors } = score(driver, ctx);

  let level: TrolleyAdvisoryLevel;
  let message: string;

  if (s >= T.SCORE_REQUIRED) {
    level = 'REQUIRED';
    const reason = factors.slice(0, 2).join(', ').toLowerCase();
    message = `🛒 Use trolley — ${reason}`;
  } else if (s >= T.SCORE_SUGGESTED) {
    level = 'SUGGESTED';
    const reason = factors[0]?.toLowerCase() ?? 'heavy parcel';
    message = `🛒 Trolley recommended — ${reason}`;
  } else {
    level = 'NONE';
    message = '';
  }

  return { level, message, score: s, factors };
}
