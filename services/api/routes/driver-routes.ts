import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

/**
 * Driver routes — profile, today's route, route detail, plan accept.
 * Pattern follows existing route files in services/api/routes/
 */
export async function driverRoutes(server: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/drivers/me
   * Returns current driver's profile and status.
   */
  server.get('/api/v1/drivers/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const driverId = (request as any).authUser?.id;
    // TODO: fetch driver profile from DB
    return reply.send({ ok: true, data: { id: driverId } });
  });


  /**
   * GET /api/v1/driver/me/today-route
   * Returns the most recent active route for the authenticated driver today.
   * Returns { ok: true, routeId: null } when no active route exists.
   */
  server.get(
    '/api/v1/driver/me/today-route',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const driverId = (request as any).authUser?.id;

      const { rows } = await pool.query(
        `SELECT id as route_id, status, total_stops, created_at
         FROM routes
         WHERE driver_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [driverId],
      );

      if (!rows.length) {
        return reply.send({ ok: true, routeId: null });
      }

      const row = rows[0] as {
        route_id: string;
        status: string;
        total_stops: number;
        created_at: Date;
      };

      return reply.send({
        ok: true,
        routeId:    row.route_id,
        status:     row.status,
        totalStops: row.total_stops,
      });
    },
  );


  /**
   * GET /api/v1/driver/routes/:routeId
   * Returns route detail (with stops) for a route owned by the authenticated driver.
   * 404 if the route doesn't exist or belongs to a different driver.
   */
  server.get<{ Params: { routeId: string } }>(
    '/api/v1/driver/routes/:routeId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { routeId } = request.params;
      const driverId = (request as any).authUser?.id;

      const { rows } = await pool.query(
        `SELECT r.*, json_agg(s.* ORDER BY s.sequence_number) as stops
         FROM routes r
         LEFT JOIN stops s ON s.route_id = r.id
         WHERE r.id = $1 AND r.driver_id = $2
         GROUP BY r.id`,
        [routeId, driverId],
      );

      if (!rows.length) {
        return reply.code(404).send({ ok: false, error: 'Route not found' });
      }

      const row = rows[0] as { stops: unknown[]; [key: string]: unknown };
      const { stops, ...routeFields } = row;

      return reply.send({
        ok: true,
        data: {
          route: routeFields,
          stops: (stops ?? []).filter(Boolean),
        },
      });
    },
  );


  /**
   * POST /api/v1/routes/:routeId/plan/accept
   * Driver accepts an optimised plan, transitioning the route to 'accepted' status.
   */
  server.post<{ Params: { routeId: string } }>(
    '/api/v1/routes/:routeId/plan/accept',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { routeId } = request.params;
      const driverId = (request as any).authUser?.id;

      const { rowCount } = await pool.query(
        `UPDATE routes SET status = 'accepted', updated_at = NOW()
         WHERE id = $1 AND driver_id = $2`,
        [routeId, driverId],
      );

      if (!rowCount) {
        return reply.code(404).send({ ok: false, error: 'Route not found' });
      }

      return reply.send({ ok: true });
    },
  );
}
