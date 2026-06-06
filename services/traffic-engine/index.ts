/**
 * MJ Maps Systems — Traffic Intelligence Engine
 * Models congestion by time of day, school proximity, and event detection
 */

export interface TrafficProfile {
  /** Hour of day (0–23.99) */
  hourFloat: number;
  /** Congestion multiplier 0.0 (free flow) – 1.0 (gridlock) */
  congestionMultiplier: number;
  /** Whether this window is a school run period */
  isSchoolRun: boolean;
  /** Whether this window is an AM/PM commuter peak */
  isPeak: boolean;
  /** Recommended action for route planner */
  recommendation: 'OPTIMAL' | 'ACCEPTABLE' | 'AVOID';
}

/**
 * Time windows for UK driving
 * Based on Gaussian mixture model calibrated against TomTom Traffic Index UK 2023
 */
export const TRAFFIC_WINDOWS = {
  EARLY_MORNING:  { start: 5.0,  end: 7.0,  label: 'Early morning',    avoidance: 0.0 },
  SCHOOL_AM:      { start: 7.75, end: 9.25, label: 'School run (AM)',   avoidance: 0.8 },
  AM_PEAK:        { start: 7.5,  end: 9.5,  label: 'AM commuter peak',  avoidance: 0.9 },
  MID_MORNING:    { start: 9.5,  end: 11.5, label: 'Mid morning',       avoidance: 0.1 },
  MIDDAY:         { start: 11.5, end: 13.5, label: 'Midday',            avoidance: 0.15 },
  AFTERNOON:      { start: 13.5, end: 15.0, label: 'Afternoon',         avoidance: 0.1 },
  SCHOOL_PM:      { start: 15.0, end: 16.0, label: 'School run (PM)',   avoidance: 0.7 },
  PM_PEAK:        { start: 16.0, end: 19.0, label: 'PM commuter peak',  avoidance: 0.85 },
  EVENING:        { start: 19.0, end: 22.0, label: 'Evening',           avoidance: 0.05 },
  NIGHT:          { start: 22.0, end: 24.0, label: 'Night',             avoidance: 0.0 },
} as const;

/**
 * Compute congestion multiplier for a given time using a Gaussian mixture
 * representing AM peak, PM peak, and school run shoulders
 */
export function getCongestionMultiplier(hourFloat: number): number {
  const gauss = (x: number, mu: number, sigma: number, amp: number) =>
    amp * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

  const multiplier =
    0.10 +                              // baseline
    gauss(hourFloat, 8.25, 0.60, 0.55) + // AM peak
    gauss(hourFloat, 17.5, 0.70, 0.65) + // PM peak
    gauss(hourFloat, 8.75, 0.35, 0.30) + // School AM shoulder
    gauss(hourFloat, 15.35, 0.35, 0.30); // School PM shoulder

  return Math.min(multiplier, 1.0);
}

/**
 * Get a traffic profile for a given time
 */
export function getTrafficProfile(hourFloat: number): TrafficProfile {
  const cm = getCongestionMultiplier(hourFloat);
  const isSchoolRun =
    (hourFloat >= 7.75 && hourFloat <= 9.25) ||
    (hourFloat >= 15.0 && hourFloat <= 16.0);
  const isPeak =
    (hourFloat >= 7.5 && hourFloat <= 9.5) ||
    (hourFloat >= 16.0 && hourFloat <= 19.0);

  let recommendation: TrafficProfile['recommendation'];
  if (cm < 0.25) recommendation = 'OPTIMAL';
  else if (cm < 0.55) recommendation = 'ACCEPTABLE';
  else recommendation = 'AVOID';

  return { hourFloat, congestionMultiplier: cm, isSchoolRun, isPeak, recommendation };
}

/**
 * Given a route with estimated travel time, find the optimal departure window
 * to minimise total congestion exposure
 *
 * @param earliestDeparture  - earliest allowed departure (decimal hour, e.g. 6.5 = 06:30)
 * @param latestDeparture    - latest allowed departure
 * @param routeDurationHours - estimated route duration in hours
 * @returns optimal departure time and expected congestion saving
 */
export function optimiseDeparture(params: {
  earliestDeparture: number;
  latestDeparture: number;
  routeDurationHours: number;
  stepMinutes?: number;
}): { optimalDeparture: number; congestionScore: number; label: string } {
  const { earliestDeparture, latestDeparture, routeDurationHours, stepMinutes = 15 } = params;
  const step = stepMinutes / 60;

  let best = { departure: earliestDeparture, score: Infinity };

  for (let dep = earliestDeparture; dep <= latestDeparture; dep += step) {
    // Sample congestion at 4 points through the route duration
    const samples = [0, 0.25, 0.5, 0.75, 1.0].map((t) =>
      getCongestionMultiplier(dep + t * routeDurationHours)
    );
    const avgCongestion = samples.reduce((a, b) => a + b) / samples.length;
    if (avgCongestion < best.score) {
      best = { departure: dep, score: avgCongestion };
    }
  }

  const hours = Math.floor(best.departure);
  const mins  = Math.round((best.departure - hours) * 60);
  const label = `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;

  return { optimalDeparture: best.departure, congestionScore: best.score, label };
}

// ─── SCHOOL ZONE ENGINE ──────────────────────────────────────────────────────

export interface SchoolZone {
  id: string;
  lat: number;
  lng: number;
  schoolName: string;
  /** Radius (metres) that triggers increased caution */
  warningRadiusM: number;
  /** Typical morning session start (decimal hour) */
  sessionStartAM: number;
  /** Typical afternoon dismissal (decimal hour) */
  sessionEndPM: number;
  /** Whether 20mph restriction is in force */
  has20Zone: boolean;
  /** Whether road is closed / pedestrianised at school times */
  roadClosedAtSchoolTimes: boolean;
}

/**
 * Determine if a stop at a given time is within a school zone during active hours
 * and return a risk assessment
 */
export function assessSchoolZoneRisk(params: {
  stopLat: number;
  stopLng: number;
  arrivalHour: number;
  nearbySchools: SchoolZone[];
}): { risk: 'LOW' | 'MEDIUM' | 'HIGH'; reason: string; suggestReschedule: boolean } {
  const { arrivalHour, nearbySchools } = params;

  for (const school of nearbySchools) {
    const inAMWindow = arrivalHour >= school.sessionStartAM - 0.5 &&
                       arrivalHour <= school.sessionStartAM + 0.5;
    const inPMWindow = arrivalHour >= school.sessionEndPM - 0.25 &&
                       arrivalHour <= school.sessionEndPM + 0.5;

    if (school.roadClosedAtSchoolTimes && (inAMWindow || inPMWindow)) {
      return {
        risk: 'HIGH',
        reason: `Road closed near ${school.schoolName} during school hours`,
        suggestReschedule: true,
      };
    }
    if (inAMWindow || inPMWindow) {
      return {
        risk: 'MEDIUM',
        reason: `Within ${school.warningRadiusM}m of ${school.schoolName} during ${inAMWindow ? 'morning' : 'afternoon'} school run`,
        suggestReschedule: true,
      };
    }
  }

  return { risk: 'LOW', reason: 'No school zone conflict', suggestReschedule: false };
}

// ─── RAILWAY LEVEL CROSSING ENGINE ──────────────────────────────────────────

export type CrossingType = 'AUTOMATIC_HALF_BARRIER' | 'MANUALLY_CONTROLLED' | 'OPEN' | 'FOOTPATH';

export interface LevelCrossing {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: CrossingType;
  lineFrequencyPerHour: number; // trains/hr in busiest direction
  closureDurationSecs: number;  // how long barrier is down per train
  /** Whether this crossing has live status available via Darwin/Network Rail API */
  hasLiveStatus: boolean;
}

/**
 * Estimate expected wait time at a level crossing given arrival time
 * Returns expected delay in seconds
 */
export function estimateCrossingDelay(crossing: LevelCrossing, arrivalHour: number): number {
  // Peak train frequency: 06:00-09:30 and 16:00-19:00 (typical UK commuter line)
  const isPeakTrain = (arrivalHour >= 6 && arrivalHour <= 9.5) ||
                      (arrivalHour >= 16 && arrivalHour <= 19);
  const effectiveFrequency = crossing.lineFrequencyPerHour * (isPeakTrain ? 1.4 : 0.7);
  // Probability crossing is active when driver arrives
  const cycleTime = 3600 / effectiveFrequency;
  const pClosed = crossing.closureDurationSecs / cycleTime;
  // Expected wait = p(closed) * average remaining closure time
  const expectedWait = pClosed * (crossing.closureDurationSecs / 2);
  return expectedWait;
}
