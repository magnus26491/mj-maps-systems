/**
 * services/route-optimizer/src/departure-optimizer.ts
 * ==================================================
 * Standalone departure recommendation function for API consumers
 * who want departure advice without running a full route optimisation.
 *
 * Delegates to optimiseDeparture() in traffic-engine.
 */

import { optimiseDeparture } from '../../traffic-engine/index.js';

export interface DepartureRecommendation {
  /** Recommended departure in HH:MM format */
  optimalDeparture: string;
  /** Decimal hour of optimal departure */
  optimalHour: number;
  /** Congestion score 0.0–1.0 at optimal departure (lower = better) */
  congestionScore: number;
  /** Time windows to avoid with reasons */
  avoidanceWindows: Array<{ start: string; end: string; reason: string }>;
}

/**
 * Recommend the best departure time within a given window.
 * Accounts for traffic peaks, school runs, and route duration.
 */
export function recommendDeparture(params: {
  earliestDeparture: number;
  latestDeparture: number;
  estimatedRouteHours: number;
}): DepartureRecommendation {
  const result = optimiseDeparture({
    earliestDeparture:  params.earliestDeparture,
    latestDeparture:    params.latestDeparture,
    routeDurationHours: params.estimatedRouteHours,
    stepMinutes: 15,
  });

  return {
    optimalDeparture: result.label,
    optimalHour:     result.optimalDeparture,
    congestionScore:  result.congestionScore,
    avoidanceWindows: [
      { start: '07:30', end: '09:30', reason: 'AM commuter peak + school run' },
      { start: '15:00', end: '16:00', reason: 'School run (PM)' },
      { start: '16:00', end: '19:00', reason: 'PM commuter peak' },
    ],
  };
}
