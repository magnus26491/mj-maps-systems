/**
 * Route Completion Engine
 * -----------------------
 * Pure service — no Express, no HTTP.
 * Checks whether a route's stops are all resolved and stamps it as completed
 * with actual GPS distance, on-time flag, and finished_at timestamp.
 */

import { pool } from '../../services/db';

interface RouteRow {
  id: string;
  driver_id: string | null;
  status: string;
  total_stops: number;
  completed_stops: number;
  failed_stops: number;
  shift_start: Date | null;
  estimated_completion: Date | null;
  total_distance_km: number;
}

interface StopCounts {
  delivered: number;
  failed: number;
  pending: number;
}

interface GpsPoint {
  lat: number;
  lng: number;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const clampedA = Math.min(1, Math.max(0, a));
  return R * 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
}

/**
 * Attempt to mark a route as completed if all its stops are resolved.
 *
 * Returns true if the route was marked completed; false otherwise (not found,
 * already completed, still has pending stops, or an error occurred).
 * Never throws — all errors are logged and result in false.
 */
export async function maybeCompleteRoute(routeId: string): Promise<boolean> {
  try {
    // 1. Load route
    const routeResult = await pool.query<RouteRow>(
      `SELECT id, driver_id, status, total_stops, completed_stops, failed_stops,
              shift_start, estimated_completion, total_distance_km
       FROM routes WHERE id = $1 LIMIT 1`,
      [routeId],
    );

    if (routeResult.rows.length === 0) return false;
    const route = routeResult.rows[0]!;

    // 2. Idempotency guard
    if (route.status === 'completed') return false;

    // 3. Live stop counts
    const stopsResult = await pool.query<StopCounts>(`
      SELECT
        (COUNT(*) FILTER (WHERE status = 'delivered'))::integer AS delivered,
        (COUNT(*) FILTER (WHERE status = 'failed'))::integer    AS failed,
        (COUNT(*) FILTER (WHERE status = 'pending'))::integer   AS pending
      FROM stops WHERE route_id = $1
    `, [routeId]);

    const { delivered, failed, pending } = stopsResult.rows[0] ?? { delivered: 0, failed: 0, pending: 0 };

    // 4. Not done yet
    if (pending > 0) return false;

    // 5. Route is complete — compute metrics
    const finishedAt = new Date();
    const estimatedCompletion = route.estimated_completion;

    // onTime: null if no estimate exists, otherwise boolean comparison
    let onTime: boolean | null = null;
    if (estimatedCompletion !== null) {
      onTime = finishedAt <= estimatedCompletion;
    }

    // actualDistanceKm: GPS from driver_locations, or fallback to route.total_distance_km
    let actualDistanceKm = route.total_distance_km ?? 0;

    const locResult = await pool.query<GpsPoint>(
      `SELECT lat, lng FROM driver_locations
       WHERE route_id = $1 ORDER BY recorded_at ASC`,
      [routeId],
    );

    const points = locResult.rows;
    if (points.length >= 2) {
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]!;
        const curr = points[i]!;
        total += haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
      }
      actualDistanceKm = Math.round(total * 100) / 100;
    }

    // 7. Stamp route as completed (atomic race guard)
    const updateResult = await pool.query(`
      UPDATE routes SET
        status              = 'completed',
        finished_at         = $2,
        on_time             = $3,
        actual_distance_km  = $4,
        completed_stops     = $5,
        failed_stops        = $6
      WHERE id = $1 AND status != 'completed'
    `, [routeId, finishedAt, onTime, actualDistanceKm, delivered, failed]);

    return (updateResult.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[route-completion]', err);
    return false;
  }
}