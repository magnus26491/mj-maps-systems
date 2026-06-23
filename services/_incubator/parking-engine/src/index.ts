/**
 * Parking Engine
 *
 * Finds the optimal legal stopping point for each delivery stop.
 * Drivers waste ~15 min/shift circling or stopping illegally.
 *
 * Priority order for stop selection:
 *  1. Designated loading bay within 50m
 *  2. Single/double yellow line (legal outside restriction hours)
 *  3. Resident permit zone (flag but permit may apply)
 *  4. Nearest legal parking on same side of road
 *  5. Opposite side with safe crossing assessment
 *
 * Data sources:
 *  · OSM: amenity=parking, parking:lane tags, restriction tags
 *  · UK NAPTAN/NPTG: loading bay locations
 *  · Driver feedback: verified "always park here" points
 */

export type ParkingType =
  | 'loading_bay'
  | 'yellow_line_timed'
  | 'yellow_line_restricted'
  | 'resident_permit'
  | 'pay_and_display'
  | 'free_parking'
  | 'no_stopping';

export interface ParkingSpot {
  lat:              number;
  lng:              number;
  type:             ParkingType;
  distanceM:        number;        // from delivery stop
  sideOfRoad:       'same' | 'opposite';
  restrictionStart?: string;       // HH:MM
  restrictionEnd?:   string;       // HH:MM
  maxStayMins?:      number;
  source:           'osm' | 'naptan' | 'driver_verified';
  confidence:       number;        // 0.0 → 1.0
}

export interface ParkingResult {
  recommended:   ParkingSpot | null;
  alternatives:  ParkingSpot[];
  walkingMetres: number;
  warningMessage?: string;
}

/**
 * Score a parking spot — higher = better.
 * Loading bays and same-side close spots rank highest.
 */
export function scoreParkingSpot(spot: ParkingSpot, currentHour: number): number {
  let score = 0;

  // Type preference
  const typeScores: Record<ParkingType, number> = {
    loading_bay:             100,
    free_parking:             80,
    yellow_line_timed:        70,
    pay_and_display:          60,
    resident_permit:          40,
    yellow_line_restricted:   10,
    no_stopping:               0,
  };
  score += typeScores[spot.type] ?? 0;

  // Distance penalty (closer = better)
  score -= Math.min(spot.distanceM / 2, 50); // max 50pt penalty at 100m+

  // Same side of road bonus
  if (spot.sideOfRoad === 'same') score += 20;

  // Restriction check for timed yellows
  if (spot.type === 'yellow_line_timed' && spot.restrictionStart && spot.restrictionEnd) {
    const [sh, sm] = spot.restrictionStart.split(':').map(Number);
    const [eh, em] = spot.restrictionEnd.split(':').map(Number);
    const startFrac = sh + sm / 60;
    const endFrac   = eh + em / 60;
    if (currentHour >= startFrac && currentHour < endFrac) {
      score -= 60; // In restriction window — heavily penalise
    }
  }

  // Driver-verified confidence bonus
  score += spot.confidence * 10;

  return score;
}

/**
 * Select the best parking spot from a list for the current time.
 */
export function selectBestSpot(
  spots: ParkingSpot[],
  currentHour: number,
): ParkingResult {
  if (spots.length === 0) {
    return { recommended: null, alternatives: [], walkingMetres: 0, warningMessage: 'No parking data available for this location' };
  }

  const scored = spots
    .map(s => ({ spot: s, score: scoreParkingSpot(s, currentHour) }))
    .sort((a, b) => b.score - a.score);

  const [best, ...rest] = scored;

  return {
    recommended:   best.spot,
    alternatives:  rest.slice(0, 3).map(r => r.spot),
    walkingMetres: best.spot.distanceM,
    warningMessage: best.spot.type === 'no_stopping'
      ? 'No safe stopping point found within 200m — manual assessment required'
      : undefined,
  };
}
