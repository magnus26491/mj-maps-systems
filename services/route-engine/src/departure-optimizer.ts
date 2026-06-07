/**
 * services/route-engine/src/departure-optimizer.ts
 * ===============================================
 * Departure window advisor for delivery routes.
 *
 * Evaluates 11 departure windows (05:00–20:00 in 90-min increments)
 * and scores them by traffic + tidal risk.
 * Returns the best window and the delay multiplier vs off-peak.
 *
 * Pure functions — no I/O, no DB calls.
 */

export interface DepartureWindow {
  label: string;         // e.g. "06:00"
  hourStart: number;     // 0-23
  hourEnd: number;       // exclusive
  trafficPenalty: number; // 1.0 = free-flow, 1.65 = peak traffic
  tidalRiskScore: number; // 0.0 = no tidal risk, 1.0 = worst tidal window
  overallScore: number;   // weighted: 70% traffic, 30% tidal
  recommended: boolean;   // true if overallScore is highest
}

export const DEPARTURE_WINDOWS: DepartureWindow[] = [
  {
    label: '05:00', hourStart: 5, hourEnd: 6.5,
    trafficPenalty: 1.05, tidalRiskScore: 0.15, overallScore: 0, recommended: false,
  },
  {
    label: '06:30', hourStart: 6.5, hourEnd: 8,
    trafficPenalty: 1.35, tidalRiskScore: 0.25, overallScore: 0, recommended: false,
  },
  {
    label: '08:00', hourStart: 8, hourEnd: 9.5,
    trafficPenalty: 1.62, tidalRiskScore: 0.40, overallScore: 0, recommended: false,
  },
  {
    label: '09:30', hourStart: 9.5, hourEnd: 11,
    trafficPenalty: 1.20, tidalRiskScore: 0.35, overallScore: 0, recommended: false,
  },
  {
    label: '11:00', hourStart: 11, hourEnd: 12.5,
    trafficPenalty: 1.10, tidalRiskScore: 0.20, overallScore: 0, recommended: false,
  },
  {
    label: '12:30', hourStart: 12.5, hourEnd: 14,
    trafficPenalty: 1.12, tidalRiskScore: 0.30, overallScore: 0, recommended: false,
  },
  {
    label: '14:00', hourStart: 14, hourEnd: 15.5,
    trafficPenalty: 1.20, tidalRiskScore: 0.45, overallScore: 0, recommended: false,
  },
  {
    label: '15:30', hourStart: 15.5, hourEnd: 17,
    trafficPenalty: 1.58, tidalRiskScore: 0.55, overallScore: 0, recommended: false,
  },
  {
    label: '17:00', hourStart: 17, hourEnd: 18.5,
    trafficPenalty: 1.65, tidalRiskScore: 0.50, overallScore: 0, recommended: false,
  },
  {
    label: '18:30', hourStart: 18.5, hourEnd: 20,
    trafficPenalty: 1.35, tidalRiskScore: 0.30, overallScore: 0, recommended: false,
  },
  {
    label: '20:00', hourStart: 20, hourEnd: 22,
    trafficPenalty: 1.05, tidalRiskScore: 0.20, overallScore: 0, recommended: false,
  },
];

/**
 * Returns the departure delay multiplier for a given hour.
 * Used to scale base route time: totalMinutes = baseMinutes * getDepartureDelayMultiplier(hour)
 *
 * Values derived from TomTom Traffic Index + 10k simulation.
 * Higher = worse (more delay expected).
 */
export function getDepartureDelayMultiplier(requestedHour: number): number {
  if (requestedHour >= 5  && requestedHour < 6.5)  return 1.05;
  if (requestedHour >= 6.5 && requestedHour < 8)    return 1.35;
  if (requestedHour >= 8   && requestedHour < 9.5)  return 1.62;
  if (requestedHour >= 9.5 && requestedHour < 11)   return 1.20;
  if (requestedHour >= 11  && requestedHour < 12.5) return 1.10;
  if (requestedHour >= 12.5 && requestedHour < 14) return 1.12;
  if (requestedHour >= 14  && requestedHour < 15.5) return 1.20;
  if (requestedHour >= 15.5 && requestedHour < 17)   return 1.58;
  if (requestedHour >= 17  && requestedHour < 18.5) return 1.65;
  if (requestedHour >= 18.5 && requestedHour < 20)   return 1.35;
  if (requestedHour >= 20  && requestedHour < 22)   return 1.05;
  return 1.0; // night / off-peak
}

/**
 * Score and rank all departure windows.
 * Returns windows sorted by overallScore descending.
 *
 * @param tidalRiskScores  Map from window label → tidal risk (0.0-1.0)
 *                          Omit to use default seed values from DEPARTURE_WINDOWS.
 */
export function getBestDepartureWindow(
  requestedHour?: number,
  tidalRiskScores?: Partial<Record<string, number>>,
): DepartureWindow & { delayMinutes: number } {
  // Compute overall score for each window
  const scored = DEPARTURE_WINDOWS.map((w) => {
    const tidalRisk = tidalRiskScores?.[w.label] ?? w.tidalRiskScore;
    const overallScore = w.trafficPenalty * 0.70 + tidalRisk * 0.30;
    return { ...w, overallScore, recommended: false };
  });

  // Sort descending by overall score (lower = better)
  scored.sort((a, b) => a.overallScore - b.overallScore);

  // Mark best as recommended
  if (scored.length > 0) scored[0].recommended = true;

  // Compute delay vs the best window
  const bestHour = scored[0].hourStart;
  const requested = requestedHour ?? 8;
  const delayMinutes = Math.round(Math.abs(requested - bestHour) * 60);

  return { ...scored[0], delayMinutes };
}
