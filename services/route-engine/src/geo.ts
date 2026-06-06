/**
 * Route Engine — geometry utilities
 *
 * All distance/bearing calculations used by the solver.
 * Pure functions — no side effects, fully testable.
 */

export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bearing in degrees (0 = North, 90 = East) from point A to point B.
 * Used for approach-side logic (which kerb to stop on).
 */
export function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y    = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x    =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Determine which side of the road to stop on based on travel bearing.
 * UK traffic drives on the left — stop on the LEFT kerb when travelling
 * in the same direction as traffic (bearing 0-180 = northbound = L kerb).
 *
 * This is a heuristic — real implementation adds OSM road direction.
 */
export function stopSide(bearing: number): 'L' | 'R' {
  // Simplified: if travelling roughly north or east, stop on left
  return (bearing >= 0 && bearing < 180) ? 'L' : 'R';
}

/**
 * Build a simple N×N distance matrix for a list of lat/lng points.
 * Index 0 = depot, indices 1..N = stops.
 */
export function buildDistanceMatrix(
  points: Array<{ lat: number; lng: number }>,
): number[][] {
  return points.map((a, i) =>
    points.map((b, j) =>
      i === j ? 0 : haversineM(a.lat, a.lng, b.lat, b.lng)
    )
  );
}
