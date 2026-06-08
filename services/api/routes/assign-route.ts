import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

/**
 * Assign route — dispatcher assigns a route to a driver.
 * Pattern follows existing route files in services/api/routes/
 */
export async function assignRouteRoutes(server: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/routes/:routeId/assign
   * Assigns a route to a driver.
   */
  server.post<{
    Params: { routeId: string };
    Body: { driverId: string };
  }>(
    '/api/v1/routes/:routeId/assign',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { routeId } = request.params;
      const { driverId } = request.body;

      if (!routeId || !driverId) {
        return reply.code(400).send({ ok: false, error: 'routeId and driverId are required' });
      }

      // TODO: implement route assignment logic
      return reply.send({ ok: true, data: { routeId, driverId } });
    },
  );
}