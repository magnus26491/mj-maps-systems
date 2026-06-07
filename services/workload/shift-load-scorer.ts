/**
 * MJ Maps Systems — Shift Load Scorer
 *
 * FIX #7: Fatigue and Workload Modelling
 *
 * Complaint: routes ignore physical strain and realistic work pace.
 * Drivers are given 180-stop routes with no break time, no account for
 * stairs, oversized parcels, or walk distances — and then get fired for
 * failing to complete them.
 *
 * Solution:
 *   1. Model each stop's workload unit cost (WUC)
 *   2. Accumulate WUC across the shift and project fatigue level
 *   3. Insert mandatory break points when WUC hits thresholds
 *   4. Flag stops that push the shift into unsafe territory
 *   5. Output a "safe stop count" recommendation
 *
 * Workload Unit Cost (WUC) per stop:
 *   Base: 1.0
 *   + 0.5 per flight of stairs
 *   + 0.3 if oversized parcel (> 30kg or > 120cm longest side)
 *   + 0.2 if requires signature
 *   + walkTimeMin × 0.15 (walk penalty)
 *   + 0.1 per additional parcel above 1
 *
 * Break thresholds:
 *   At 60 WUC: 15-minute break required
 *   At 120 WUC: 30-minute break required
 *   At 180 WUC: shift end recommended
 */

export interface StopWorkload {
  stopId: string;
  wuc: number;                   // Workload Unit Cost
  cumulativeWuc: number;         // running total
  fatigueLevel: FatigueLevel;
  breakRequired?: BreakInsert;   // inserted break point if threshold hit
}

export type FatigueLevel = 'low' | 'medium' | 'high' | 'critical';

export interface BreakInsert {
  afterStopId: string;
  durationMin: number;
  reason: string;
}

export interface WorkloadInput {
  stopId: string;
  flightsOfStairs?: number;
  isOversize?: boolean;        // parcel > 30kg or > 120cm
  requiresSignature?: boolean;
  walkDistanceM?: number;      // walk from parking to door
  parcelCount?: number;
  weight_kg?: number;
}

const BREAK_THRESHOLDS = [
  { wuc: 60,  durationMin: 15, reason: 'Scheduled rest break' },
  { wuc: 120, durationMin: 30, reason: 'Mandatory mid-shift break (legal requirement)' },
  { wuc: 180, durationMin: 0,  reason: 'Shift-end threshold reached — stop count exceeded' },
];

function fatigueFromWuc(wuc: number): FatigueLevel {
  if (wuc < 60)  return 'low';
  if (wuc < 100) return 'medium';
  if (wuc < 150) return 'high';
  return 'critical';
}

export function computeStopWuc(stop: WorkloadInput): number {
  const walkMin = (stop.walkDistanceM ?? 0) / 1.4 / 60; // 1.4 m/s walking speed

  let wuc = 1.0;
  wuc += (stop.flightsOfStairs ?? 0) * 0.5;
  if (stop.isOversize || (stop.weight_kg ?? 0) > 30) wuc += 0.3;
  if (stop.requiresSignature) wuc += 0.2;
  wuc += walkMin * 0.15;
  wuc += Math.max(0, (stop.parcelCount ?? 1) - 1) * 0.1;

  return Math.round(wuc * 100) / 100;
}

export function scoreShiftWorkload(
  stops: WorkloadInput[],
): {
  stopWorkloads: StopWorkload[];
  totalWuc: number;
  safeStopCount: number;
  breaks: BreakInsert[];
  shiftFeasible: boolean;
  recommendations: string[];
} {
  const result: StopWorkload[] = [];
  const breaks: BreakInsert[] = [];
  let cumulative = 0;
  let lastBreakAt = 0;
  const recommendations: string[] = [];

  for (const stop of stops) {
    const wuc = computeStopWuc(stop);
    cumulative += wuc;

    let breakRequired: BreakInsert | undefined;

    // Check if we cross a break threshold since last break
    for (const threshold of BREAK_THRESHOLDS) {
      if (cumulative >= threshold.wuc && lastBreakAt < threshold.wuc) {
        if (threshold.durationMin > 0) {
          const brk: BreakInsert = {
            afterStopId: stop.stopId,
            durationMin: threshold.durationMin,
            reason: threshold.reason,
          };
          breaks.push(brk);
          breakRequired = brk;
          lastBreakAt = cumulative;
        }
      }
    }

    result.push({
      stopId: stop.stopId,
      wuc,
      cumulativeWuc: Math.round(cumulative * 100) / 100,
      fatigueLevel: fatigueFromWuc(cumulative),
      breakRequired,
    });
  }

  // Safe stop count = index at which WUC first hits 150 (high fatigue onset)
  const safeIdx = result.findIndex(s => s.cumulativeWuc >= 150);
  const safeStopCount = safeIdx === -1 ? stops.length : safeIdx;

  const shiftFeasible = cumulative < 180;

  if (!shiftFeasible) {
    recommendations.push(
      `Route exceeds safe workload (${cumulative.toFixed(0)} WUC vs 180 max). ` +
      `Consider splitting at stop ${safeStopCount} or reducing parcel weight.`
    );
  }
  if (breaks.some(b => b.durationMin >= 30)) {
    recommendations.push('Legal 30-minute break required — ETA calculations include break time.');
  }
  const highStairs = stops.filter(s => (s.flightsOfStairs ?? 0) >= 3);
  if (highStairs.length > 5) {
    recommendations.push(
      `${highStairs.length} stops require 3+ flights of stairs — prioritise these early in shift while energy is highest.`
    );
  }

  return {
    stopWorkloads: result,
    totalWuc: Math.round(cumulative * 100) / 100,
    safeStopCount,
    breaks,
    shiftFeasible,
    recommendations,
  };
}
