import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

/**
 * Driver routes — profile, status, location.
 * Pattern follows existing route files in services/api/routes/
 */
export async function driverRoutes(server: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/drivers/me
   * Returns current driver's profile and status.
   */
  server.get('/api/v1/drivers/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const driverId = (request as any).authUser?.sub;
    // TODO: fetch driver profile from DB
    return reply.send({ ok: true, data: { id: driverId } });
  });
}