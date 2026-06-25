/**
 * services/api/routes/dispatcher.ts
 * Aggregation endpoints for the dispatcher dashboard.
 * All routes: dispatcher or admin role + DISPATCHER feature (custom plan).
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole, requireFeature } from '../middleware/auth.js';
import { pool } from '../../db/index.js';


export async function dispatcherRoutes(server: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireFeature('DISPATCHER')] };


  /**
   * GET /api/v1/dispatcher/overview
   * Live snapshot of all active routes for the dashboard home.
   * Returns one row per active driver with their route progress.
   */
  server.get('/api/v1/dispatcher/overview', guard, async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT
        d.id                                          AS "driverId",
        d.name                                        AS "driverName",
        d.vehicle_make                                AS "vehicleMake",
        d.vehicle_model                               AS "vehicleModel",
        d.vehicle_year                                AS "vehicleYear",
        d.vehicle_id                                  AS "vehicleId",
        d.vehicle_height_m                            AS "vehicleHeightM",
        d.vehicle_gvw_kg                              AS "vehicleGvwKg",
        r.id                                          AS "routeId",
        r.status                                      AS "routeStatus",
        r.created_at                                  AS "routeCreatedAt",
        COUNT(s.id)                                   AS "totalStops",
        COUNT(s.id) FILTER (WHERE s.status = 'completed') AS "completedStops",
        COUNT(s.id) FILTER (WHERE s.status = 'failed')    AS "failedStops",
        COUNT(s.id) FILTER (WHERE s.status = 'pending')   AS "pendingStops",
        MAX(s.updated_at) FILTER (WHERE s.status = 'completed') AS "lastPing"
      FROM drivers d
      JOIN routes r ON r.driver_id = d.id
        AND r.status = 'active'
        AND r.created_at::date = CURRENT_DATE
      LEFT JOIN stops s ON s.route_id = r.id
      GROUP BY d.id, r.id
      ORDER BY r.created_at DESC
    `);
    return reply.send({ ok: true, data: rows });
  });


  /**
   * GET /api/v1/dispatcher/drivers
   * Full driver roster — online/offline, today's performance.
   */
  server.get('/api/v1/dispatcher/drivers', guard, async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT
        d.id, d.name, d.email, d.role, d.plan_id   AS "planId",
        d.vehicle_id                                 AS "vehicleId",
        d.vehicle_make                               AS "vehicleMake",
        d.vehicle_model                              AS "vehicleModel",
        d.vehicle_year                               AS "vehicleYear",
        d.vehicle_height_m                           AS "vehicleHeightM",
        d.vehicle_gvw_kg                             AS "vehicleGvwKg",
        d.vehicle_payload_kg                         AS "vehiclePayloadKg",
        COALESCE(
          (SELECT r.status FROM routes r
           WHERE r.driver_id = d.id AND r.created_at::date = CURRENT_DATE
           ORDER BY r.created_at DESC LIMIT 1),
          'offline'
        )                                            AS "todayStatus",
        COALESCE(
          (SELECT COUNT(*) FROM stops s
           JOIN routes r ON r.id = s.route_id
           WHERE r.driver_id = d.id AND r.created_at::date = CURRENT_DATE
             AND s.status = 'completed'),
          0
        )                                            AS "deliveredToday",
        COALESCE(
          (SELECT COUNT(*) FROM stops s
           JOIN routes r ON r.id = s.route_id
           WHERE r.driver_id = d.id AND r.created_at::date = CURRENT_DATE
             AND s.status = 'failed'),
          0
        )                                            AS "failedToday"
      FROM drivers d
      WHERE d.role = 'driver'
      ORDER BY d.name ASC
    `);
    return reply.send({ ok: true, data: rows });
  });


  /**
   * GET /api/v1/dispatcher/routes/:routeId
   * Full route detail with all stops, status breakdown, and driver info.
   */
  server.get<{ Params: { routeId: string } }>(
    '/api/v1/dispatcher/routes/:routeId',
    guard,
    async (request, reply) => {
      const { routeId } = request.params;

      const routeRes = await pool.query(`
        SELECT r.*,
               d.name           AS "driverName",
               d.vehicle_make   AS "vehicleMake",
               d.vehicle_model  AS "vehicleModel",
               d.vehicle_id     AS "vehicleId"
        FROM routes r
        LEFT JOIN drivers d ON d.id = r.driver_id
        WHERE r.id = $1
      `, [routeId]);

      if (!routeRes.rows.length) {
        return reply.code(404).send({ ok: false, error: 'Route not found' });
      }

      const stopsRes = await pool.query(`
        SELECT s.*,
               s.access_notes   AS "accessNotes",
               s.last_50m       AS "last50m",
               s.failure_code   AS "failureCode",
               s.pod_photo_url  AS "podPhotoUrl",
               s.pin_lat        AS "pinLat",
               s.pin_lon        AS "pinLon"
        FROM stops s
        WHERE s.route_id = $1
        ORDER BY s.sequence ASC
      `, [routeId]);

      // ── ETA computation ──────────────────────────────────────────────────
      // 3-min average dwell per stop is a conservative UK urban estimate.
      const AVG_STOP_DWELL_MS = 3 * 60 * 1_000;
      const now = Date.now();

      const completedSeqs = stopsRes.rows
        .filter((s: any) => s.status === 'completed')
        .map((s: any) => (s.sequence as number) ?? 0);
      const lastCompletedSeq = completedSeqs.length > 0 ? Math.max(...completedSeqs) : 0;

      const stopsWithEta = stopsRes.rows.map((stop: any) => {
        if (stop.status === 'completed' || stop.status === 'failed') {
          return { ...stop, eta: stop.updated_at ?? null };
        }
        const stepsAhead = Math.max(1, (stop.sequence ?? 0) - lastCompletedSeq);
        return { ...stop, eta: new Date(now + stepsAhead * AVG_STOP_DWELL_MS).toISOString() };
      });

      const pendingCount = stopsRes.rows.filter((s: any) => s.status === 'pending').length;
      const estimatedCompletion = new Date(now + pendingCount * AVG_STOP_DWELL_MS).toISOString();

      return reply.send({
        ok: true,
        data: {
          route: { ...routeRes.rows[0], estimatedCompletion },
          stops: stopsWithEta,
        },
      });
    },
  );


  /**
   * GET /api/v1/dispatcher/failed-stops
   * All failed stops today across all routes — the dispatcher action queue.
   * Sorted by severity: ACCESS_DENIED first, then NO_ANSWER, then others.
   */
  server.get('/api/v1/dispatcher/failed-stops', guard, async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT
        s.id           AS "stopId",
        s.address,
        s.failure_code AS "failureCode",
        s.access_notes AS "accessNotes",
        s.updated_at   AS "failedAt",
        r.id           AS "routeId",
        d.id           AS "driverId",
        d.name         AS "driverName",
        d.vehicle_make AS "vehicleMake",
        d.vehicle_model AS "vehicleModel"
      FROM stops s
      JOIN routes r ON r.id = s.route_id
      JOIN drivers d ON d.id = r.driver_id
      WHERE s.status = 'failed'
        AND s.updated_at::date = CURRENT_DATE
      ORDER BY
        CASE s.failure_code
          WHEN 'ACCESS_DENIED' THEN 1
          WHEN 'NO_ANSWER'     THEN 2
          ELSE 3
        END,
        s.updated_at DESC
    `);
    return reply.send({ ok: true, data: rows, count: rows.length });
  });


  /**
   * POST /api/v1/dispatcher/routes/:routeId/reassign-stop
   * Move a failed stop to a different route (reslot to another driver).
   * Body: { stopId, targetRouteId }
   */
  server.post<{
    Params: { routeId: string };
    Body:   { stopId: string; targetRouteId: string };
  }>(
    '/api/v1/dispatcher/routes/:routeId/reassign-stop',
    guard,
    async (request, reply) => {
      const { stopId, targetRouteId } = request.body;
      if (!stopId || !targetRouteId) {
        return reply.code(400).send({ ok: false, error: 'stopId and targetRouteId required' });
      }

      // Verify target route exists and is active
      const targetRes = await pool.query(
        `SELECT id FROM routes WHERE id = $1 AND status = 'active'`,
        [targetRouteId],
      );
      if (!targetRes.rows.length) {
        return reply.code(404).send({ ok: false, error: 'Target route not found or not active' });
      }

      // Move stop to new route, reset to pending
      await pool.query(
        `UPDATE stops
         SET route_id = $1, status = 'pending', failure_code = NULL, updated_at = NOW()
         WHERE id = $2`,
        [targetRouteId, stopId],
      );

      return reply.send({ ok: true, message: `Stop ${stopId} reassigned to route ${targetRouteId}` });
    },
  );


  /**
   * GET /api/v1/dispatcher/analytics/today
   * Today's operational summary for the analytics view.
   */
  server.get('/api/v1/dispatcher/analytics/today', guard, async (_req, reply) => {
    const { rows: summary } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'completed')   AS "delivered",
        COUNT(*) FILTER (WHERE s.status = 'failed')       AS "failed",
        COUNT(*) FILTER (WHERE s.status = 'pending')      AS "pending",
        COUNT(*)                                          AS "total",
        ROUND(
          COUNT(*) FILTER (WHERE s.status = 'completed')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE s.status IN ('completed','failed')), 0) * 100,
          1
        )                                                 AS "successRatePct"
      FROM stops s
      JOIN routes r ON r.id = s.route_id
      WHERE r.created_at::date = CURRENT_DATE
    `);

    const { rows: byHour } = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM s.updated_at)::int  AS "hour",
        COUNT(*) FILTER (WHERE s.status = 'completed') AS "delivered",
        COUNT(*) FILTER (WHERE s.status = 'failed')    AS "failed"
      FROM stops s
      JOIN routes r ON r.id = s.route_id
      WHERE r.created_at::date = CURRENT_DATE
        AND s.status IN ('completed','failed')
      GROUP BY 1
      ORDER BY 1
    `);

    const { rows: byVehicle } = await pool.query(`
      SELECT
        d.vehicle_id                                     AS "vehicleId",
        COUNT(*) FILTER (WHERE s.status = 'completed')  AS "delivered",
        COUNT(*) FILTER (WHERE s.status = 'failed')     AS "failed"
      FROM stops s
      JOIN routes r ON r.id = s.route_id
      JOIN drivers d ON d.id = r.driver_id
      WHERE r.created_at::date = CURRENT_DATE
      GROUP BY d.vehicle_id
      ORDER BY "delivered" DESC
    `);

    return reply.send({
      ok: true,
      data: { summary: summary, byHour, byVehicle },
    });
  });
}