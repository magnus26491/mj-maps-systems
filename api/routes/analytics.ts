/**
 * api/routes/analytics.ts
 * ----------------------
 * Route analytics and end-of-shift report endpoints.
 *
 * Auth: All routes require authenticateDriver + requireRole('dispatcher') + requireEnterprise
 * to be applied at the mount point (see api/index.ts). Do NOT re-apply those middlewares here.
 *
 * Endpoints:
 *   GET  /api/dispatcher/analytics/routes       — list of route summaries
 *   GET  /api/dispatcher/analytics/routes/:id   — stop-level breakdown
 *   GET  /api/dispatcher/analytics/summary      — fleet-wide KPIs for today
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';

export const analyticsRouter = Router();

// ── Date helpers ───────────────────────────────────────────────────────────

function parseDate(param: string | undefined, fallback: Date): Date {
  if (!param) return fallback;
  const d = new Date(param);
  return isNaN(d.getTime()) ? fallback : d;
}

// ── GET /api/dispatcher/analytics/routes ───────────────────────────────────
analyticsRouter.get('/routes', async (req: Request, res: Response) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const from = parseDate(req.query.from as string | undefined, sevenDaysAgo);
  const to = parseDate(req.query.to as string | undefined, now);
  const driverId = req.query.driverId as string | undefined;
  const rawLimit = parseInt(req.query.limit as string) || 20;
  const limit = Math.min(rawLimit, 100);

  try {
    let query = `
      SELECT
        r.id                    AS "routeId",
        r.driver_id             AS "driverId",
        d.name                  AS "driverName",
        r.vehicle_id             AS "vehicleLabel",
        r.status,
        r.shift_start           AS "shiftStart",
        r.actual_completion     AS "finishedAt",
        r.total_stops           AS "totalStops",
        r.completed_stops       AS "completedStops",
        r.failed_stops          AS "failedStops",
        r.total_distance_km     AS "totalDistanceKm",
        r.total_distance_km     AS "actualDistanceKm",
        NULL::boolean           AS "onTime",
        COUNT(s.id) FILTER (WHERE s.proof_photo_url IS NOT NULL) AS "podCount",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED') AS "redAlerts",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER') AS "amberAlerts"
      FROM routes r
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN stops s ON s.route_id = r.id
      WHERE r.status IN ('active', 'completed')
        AND r.shift_start >= $1
        AND r.shift_start <= $2
    `;
    const params: unknown[] = [from.toISOString(), to.toISOString()];

    if (driverId) {
      query += ` AND r.driver_id = $3`;
      params.push(driverId);
      query += `
        GROUP BY r.id, d.name
        ORDER BY r.shift_start DESC
        LIMIT $4
      `;
      params.push(limit);
    } else {
      query += `
        GROUP BY r.id, d.name
        ORDER BY r.shift_start DESC
        LIMIT $3
      `;
      params.push(limit);
    }

    const { rows } = await pool.query(query, params);
    res.json({ routes: rows });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── GET /api/dispatcher/analytics/routes/:routeId ──────────────────────────
analyticsRouter.get('/routes/:routeId', async (req: Request, res: Response) => {
  const { routeId } = req.params;

  try {
    // First check if route exists
    const routeResult = await pool.query(`
      SELECT
        r.id                    AS "routeId",
        r.driver_id             AS "driverId",
        d.name                  AS "driverName",
        r.vehicle_id             AS "vehicleLabel",
        r.status,
        r.shift_start           AS "shiftStart",
        r.actual_completion     AS "finishedAt",
        r.total_stops           AS "totalStops",
        r.completed_stops       AS "completedStops",
        r.failed_stops          AS "failedStops",
        r.total_distance_km     AS "totalDistanceKm",
        r.total_distance_km     AS "actualDistanceKm",
        NULL::boolean           AS "onTime",
        COUNT(s.id) FILTER (WHERE s.proof_photo_url IS NOT NULL) AS "podCount",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED') AS "redAlerts",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER') AS "amberAlerts"
      FROM routes r
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN stops s ON s.route_id = r.id
      WHERE r.id = $1
      GROUP BY r.id, d.name
    `, [routeId]);

    if (!routeResult.rows.length) {
      res.status(404).json({ success: false, error: 'Route not found.' });
      return;
    }

    // Get stops for this route
    const stopsResult = await pool.query(`
      SELECT
        s.id              AS "stopId",
        s.address,
        s.status,
        (s.proof_photo_url IS NOT NULL) AS "hasPod",
        s.turn_alert_level AS "turnAlertLevel",
        s.created_at      AS "createdAt",
        s.pod_captured_at AS "podCapturedAt"
      FROM stops s
      WHERE s.route_id = $1
      ORDER BY s.created_at ASC
    `, [routeId]);

    res.json({
      route: routeResult.rows[0],
      stops: stopsResult.rows,
    });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── GET /api/dispatcher/analytics/summary ──────────────────────────────────
analyticsRouter.get('/summary', async (_req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(r.id) FILTER (WHERE r.status = 'completed') AS "completedRoutes",
        COUNT(r.id) FILTER (WHERE r.status = 'active') AS "activeRoutes",
        COALESCE(SUM(r.completed_stops), 0)::int AS "totalStopsDelivered",
        COALESCE(SUM(r.failed_stops), 0)::int AS "totalStopsFailed",
        ROUND(
          COUNT(s.id) FILTER (WHERE s.proof_photo_url IS NOT NULL)::numeric /
          NULLIF(COUNT(s.id) FILTER (WHERE s.status = 'delivered'), 0),
          4
        ) AS "podCaptureRate",
        ROUND(
          COUNT(r.id) FILTER (WHERE r.status = 'completed')::numeric /
          NULLIF(COUNT(r.id) FILTER (WHERE r.status = 'completed'), 0),
          4
        ) AS "onTimeRate",
        ROUND(
          EXTRACT(EPOCH FROM AVG(r.actual_completion - r.shift_start)) / 60,
          1
        ) AS "avgCompletionMins",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED') AS "redAlertCount",
        COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER') AS "amberAlertCount"
      FROM routes r
      LEFT JOIN stops s ON s.route_id = r.id
      WHERE r.shift_start >= $1
    `, [today.toISOString()]);

    const row = rows[0];
    res.json({
      completedRoutes: parseInt(row.completedRoutes),
      activeRoutes: parseInt(row.activeRoutes),
      totalStopsDelivered: parseInt(row.totalStopsDelivered),
      totalStopsFailed: parseInt(row.totalStopsFailed),
      podCaptureRate: parseFloat(row.podCaptureRate) || 0,
      onTimeRate: parseFloat(row.onTimeRate) || 0,
      avgCompletionMins: parseFloat(row.avgCompletionMins) || 0,
      redAlertCount: parseInt(row.redAlertCount),
      amberAlertCount: parseInt(row.amberAlertCount),
    });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});