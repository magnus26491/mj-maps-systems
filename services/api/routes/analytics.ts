/**
 * services/api/routes/analytics.ts
 * Route analytics and end-of-shift report endpoints (Phase 16).
 *
 * All routes require: authenticateDriver + requireRole('dispatcher') + requireEnterprise
 * These are applied at the mount point in server.ts — do NOT re-apply them here.
 *
 * Endpoints:
 *   GET  /api/v1/dispatcher/analytics/routes         — paginated route summaries
 *   GET  /api/v1/dispatcher/analytics/routes/:id     — stop-level breakdown
 *   GET  /api/v1/dispatcher/analytics/summary        — fleet-wide KPIs for today
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole, requireEnterprise } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

// ── Guards (applied at mount; these exports are for documentation) ──────────────
// export const analyticsGuard = { preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireEnterprise] };

export async function analyticsRoutes(server: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireEnterprise] };

  // ── Date helpers ─────────────────────────────────────────────────────────────

  function parseDate(param: string | undefined, fallback: Date): Date {
    if (!param) return fallback;
    const d = new Date(param);
    return isNaN(d.getTime()) ? fallback : d;
  }

  // ── GET /api/v1/dispatcher/analytics/routes ─────────────────────────────────

  server.get('/api/v1/dispatcher/analytics/routes', guard, async (request, reply) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rawFrom = (request.query as Record<string, unknown>).from as string | undefined;
    const rawTo   = (request.query as Record<string, unknown>).to   as string | undefined;
    const rawDriverId = (request.query as Record<string, unknown>).driverId as string | undefined;
    const rawLimit = (request.query as Record<string, unknown>).limit as string | undefined;

    const from = parseDate(rawFrom, sevenDaysAgo);
    const to   = parseDate(rawTo,   now);
    const driverId = rawDriverId?.trim() || undefined;
    const rawLimitNum = parseInt(rawLimit ?? '') || 20;
    const limit = Math.min(rawLimitNum, 100);

    // Validate date inputs — return 400 for unparseable dates
    if (rawFrom && isNaN(new Date(rawFrom).getTime())) {
      return reply.code(400).send({ ok: false, error: 'Invalid `from` date format.' });
    }
    if (rawTo && isNaN(new Date(rawTo).getTime())) {
      return reply.code(400).send({ ok: false, error: 'Invalid `to` date format.' });
    }

    try {
      const params: unknown[] = [from.toISOString(), to.toISOString()];

      let query = `
        SELECT
          r.id                       AS "routeId",
          r.driver_id                AS "driverId",
          d.name                     AS "driverName",
          r.vehicle_id               AS "vehicleLabel",
          r.status,
          r.shift_start              AS "shiftStart",
          r.finished_at              AS "finishedAt",
          r.total_stops              AS "totalStops",
          r.completed_stops          AS "completedStops",
          r.failed_stops             AS "failedStops",
          r.total_distance_km        AS "totalDistanceKm",
          r.actual_distance_km       AS "actualDistanceKm",
          r.on_time                  AS "onTime",
          COUNT(s.id) FILTER (WHERE s.pod_url IS NOT NULL)                   AS "podCount",
          COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED')              AS "redAlerts",
          COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER')            AS "amberAlerts"
        FROM routes r
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN stops s ON s.route_id = r.id
        WHERE r.status IN ('active', 'completed')
          AND r.shift_start >= $1
          AND r.shift_start <= $2
      `;

      if (driverId) {
        params.push(driverId);
        query += ` AND r.driver_id = $${params.length}`;
      }

      query += `
        GROUP BY r.id, d.name
        ORDER BY r.shift_start DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const { rows } = await pool.query(query, params);
      return reply.send({ ok: true, routes: rows });
    } catch (err) {
      console.error('[analytics] /routes error:', err);
      return reply.code(500).send({ ok: false, error: 'Internal server error.' });
    }
  });

  // ── GET /api/v1/dispatcher/analytics/routes/:routeId ───────────────────────

  server.get<{ Params: { routeId: string } }>(
    '/api/v1/dispatcher/analytics/routes/:routeId',
    guard,
    async (request, reply) => {
      const { routeId } = request.params;

      try {
        const routeResult = await pool.query(`
          SELECT
            r.id                       AS "routeId",
            r.driver_id                AS "driverId",
            d.name                     AS "driverName",
            r.vehicle_id               AS "vehicleLabel",
            r.status,
            r.shift_start              AS "shiftStart",
            r.finished_at              AS "finishedAt",
            r.total_stops              AS "totalStops",
            r.completed_stops          AS "completedStops",
            r.failed_stops             AS "failedStops",
            r.total_distance_km        AS "totalDistanceKm",
            r.actual_distance_km       AS "actualDistanceKm",
            r.on_time                  AS "onTime",
            COUNT(s.id) FILTER (WHERE s.pod_url IS NOT NULL)                   AS "podCount",
            COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED')              AS "redAlerts",
            COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER')            AS "amberAlerts"
          FROM routes r
          LEFT JOIN drivers d ON d.id = r.driver_id
          LEFT JOIN stops s ON s.route_id = r.id
          WHERE r.id = $1
          GROUP BY r.id, d.name
        `, [routeId]);

        if (!routeResult.rows.length) {
          return reply.code(404).send({ success: false, error: 'Route not found.' });
        }

        const stopsResult = await pool.query(`
          SELECT
            s.id               AS "stopId",
            s.address,
            s.status,
            (s.pod_url IS NOT NULL) AS "hasPod",
            s.turn_alert_level AS "turnAlertLevel",
            s.created_at       AS "createdAt",
            s.pod_captured_at  AS "podCapturedAt"
          FROM stops s
          WHERE s.route_id = $1
          ORDER BY s.created_at ASC
        `, [routeId]);

        return reply.send({
          ok: true,
          route: routeResult.rows[0],
          stops: stopsResult.rows,
        });
      } catch (err) {
        console.error('[analytics] /routes/:routeId error:', err);
        return reply.code(500).send({ ok: false, error: 'Internal server error.' });
      }
    },
  );

  // ── GET /api/v1/dispatcher/analytics/summary ───────────────────────────────

  server.get('/api/v1/dispatcher/analytics/summary', guard, async (_req, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(r.id) FILTER (WHERE r.status = 'completed')                       AS "completedRoutes",
          COUNT(r.id) FILTER (WHERE r.status = 'active')                          AS "activeRoutes",
          COALESCE(SUM(r.completed_stops), 0)::int                                AS "totalStopsDelivered",
          COALESCE(SUM(r.failed_stops), 0)::int                                   AS "totalStopsFailed",
          ROUND(
            COUNT(s.id) FILTER (WHERE s.pod_url IS NOT NULL)::numeric /
            NULLIF(COUNT(s.id) FILTER (WHERE s.status = 'delivered'), 0),
            4
          )                                                                        AS "podCaptureRate",
          ROUND(
            COUNT(r.id) FILTER (WHERE r.on_time = TRUE AND r.status = 'completed')::numeric /
            NULLIF(COUNT(r.id) FILTER (WHERE r.status = 'completed'), 0),
            4
          )                                                                        AS "onTimeRate",
          ROUND(
            EXTRACT(EPOCH FROM AVG(r.finished_at - r.shift_start)) / 60,
            1
          )                                                                        AS "avgCompletionMins",
          COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED')                   AS "redAlertCount",
          COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER')                 AS "amberAlertCount"
        FROM routes r
        LEFT JOIN stops s ON s.route_id = r.id
        WHERE r.shift_start >= $1
      `, [today.toISOString()]);

      const row = rows[0];
      return reply.send({
        ok: true,
        completedRoutes:      parseInt(row.completedRoutes)  || 0,
        activeRoutes:         parseInt(row.activeRoutes)     || 0,
        totalStopsDelivered:  parseInt(row.totalStopsDelivered) || 0,
        totalStopsFailed:     parseInt(row.totalStopsFailed)    || 0,
        podCaptureRate:       parseFloat(row.podCaptureRate)    || 0,
        onTimeRate:           parseFloat(row.onTimeRate)        || 0,
        avgCompletionMins:    parseFloat(row.avgCompletionMins) || 0,
        redAlertCount:        parseInt(row.redAlertCount)       || 0,
        amberAlertCount:      parseInt(row.amberAlertCount)     || 0,
      });
    } catch (err) {
      console.error('[analytics] /summary error:', err);
      return reply.code(500).send({ ok: false, error: 'Internal server error.' });
    }
  });
}