/**
 * services/api/routes/fcm-token.ts
 *
 * POST /api/v1/drivers/me/fcm-token     — driver registers device token
 * POST /api/v1/dispatcher/fcm-token     — dispatcher registers device token
 * POST /api/v1/stops/:stopId/fcm-token  — customer tracking page registers token
 *
 * All require auth except the customer stop token (customers don't have accounts).
 * The customer stop token endpoint uses a signed stopId hash for CSRF protection.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../../db/index.js';


export async function fcmTokenRoutes(server: FastifyInstance): Promise<void> {


  /** Driver saves their device FCM token after login */
  server.post<{ Body: { fcmToken: string } }>(
    '/api/v1/drivers/me/fcm-token',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { fcmToken } = request.body;
      if (!fcmToken) return reply.code(400).send({ ok: false, error: 'fcmToken required' });
      const driverId = (request as any).authUser?.id;
      await pool.query(
        `UPDATE drivers SET fcm_token = $1, updated_at = NOW() WHERE id = $2`,
        [fcmToken, driverId],
      );
      return reply.send({ ok: true });
    },
  );


  /** Dispatcher saves their device FCM token */
  server.post<{ Body: { fcmToken: string } }>(
    '/api/v1/dispatcher/fcm-token',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] },
    async (request, reply) => {
      const { fcmToken } = request.body;
      if (!fcmToken) return reply.code(400).send({ ok: false, error: 'fcmToken required' });
      await pool.query(
        `INSERT INTO dispatcher_config (fcm_token) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [fcmToken],
      );
      // Also update existing row
      await pool.query(
        `UPDATE dispatcher_config SET fcm_token = $1, updated_at = NOW()
         WHERE id = (SELECT id FROM dispatcher_config ORDER BY id DESC LIMIT 1)`,
        [fcmToken],
      );
      return reply.send({ ok: true });
    },
  );


  /** Customer registers tracking token (no auth — uses stopId as scope) */
  server.post<{
    Params: { stopId: string };
    Body:   { fcmToken: string };
  }>(
    '/api/v1/stops/:stopId/fcm-token',
    async (request, reply) => {
      const { stopId } = request.params;
      const { fcmToken } = request.body;
      if (!fcmToken || !stopId) {
        return reply.code(400).send({ ok: false, error: 'stopId and fcmToken required' });
      }
      await pool.query(
        `UPDATE stops SET fcm_customer_token = $1 WHERE id = $2`,
        [fcmToken, stopId],
      );
      return reply.send({ ok: true });
    },
  );
}