import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { redis } from '../../cache/index.js';
import { broadcastToDriver } from '../driver-api.js';

/**
 * Dispatcher -> driver message route.
 *
 * Delivers a plain-text message from a dispatcher or admin to one or more
 * active drivers in real-time via WebSocket (Layer 1).
 *
 * If a driver's WebSocket is not currently connected, the message is queued
 * in Redis (key: dispatcher:queue:<driverId>, TTL: 4h) and delivered on reconnect.
 */

interface DispatcherMessageBody {
  driverIds: string[];
  message: string;
  routeId?: string;
}

export async function registerDispatcherMessageRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.post<{ Body: DispatcherMessageBody }>(
    '/api/v1/dispatcher/message',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] },
    async (request, reply) => {
      const body = request.body as DispatcherMessageBody;
      const user = (request as any).authUser as { name?: string; email?: string };

      // ── Validation ─────────────────────────────────────────────────────────
      if (!body.message || typeof body.message !== 'string') {
        return reply.code(400).send({ error: 'message is required' });
      }
      if (body.message.length > 200) {
        return reply.code(400).send({ error: 'message must be 200 characters or fewer' });
      }
      if (!Array.isArray(body.driverIds) || body.driverIds.length === 0) {
        return reply.code(400).send({ error: 'driverIds must be a non-empty array' });
      }
      if (body.driverIds.length > 50) {
        return reply.code(400).send({ error: 'maximum 50 drivers per message' });
      }
      if (body.driverIds.some((id: unknown) => typeof id !== 'string' || !id)) {
        return reply.code(400).send({ error: 'all driverIds must be non-empty strings' });
      }

      const dispatcherName: string = user?.name ?? user?.email ?? 'Dispatcher';
      const payload: Record<string, unknown> = {
        type:    'DISPATCHER_MESSAGE',
        from:    dispatcherName,
        message: body.message,
        routeId: body.routeId ?? null,
        sentAt:  Date.now(),
      };

      const results = { sent: [] as string[], queued: [] as string[] };

      for (const driverId of body.driverIds) {
        // Try live WebSocket delivery — fire and forget (broadcastToDriver returns void)
        broadcastToDriver(driverId, payload);

        // Always queue so the message is available on reconnect
        // if the socket was not connected at send time.
        try {
          const queueKey = `dispatcher:queue:${driverId}`;
          await redis.rpush(queueKey, JSON.stringify(payload));
          await redis.expire(queueKey, 14_400); // 4-hour TTL
        } catch {
          // Redis unavailable — live attempt is our best effort; continue
        }
      }

      // Determine sent vs queued by checking Redis live-location keys.
      // Drivers with a recent driver:loc:<id> entry are considered live.
      try {
        const locKeys = body.driverIds.map((id: string) => `driver:loc:${id}`);
        const locs = await redis.mget(...locKeys);
        for (let i = 0; i < body.driverIds.length; i++) {
          if (locs[i]) {
            // Driver was live — remove the just-queued entry so no duplicate on reconnect
            await redis.lrem(`dispatcher:queue:${body.driverIds[i]}`, 1, JSON.stringify(payload));
            results.sent.push(body.driverIds[i]);
          } else {
            results.queued.push(body.driverIds[i]);
          }
        }
      } catch {
        // Redis unavailable — treat all as queued (we did push to queues above)
        for (const driverId of body.driverIds) {
          results.queued.push(driverId);
        }
        results.sent = [];
      }

      return reply.code(200).send({
        ok: true,
        sent:   results.sent.length,
        queued: results.queued.length,
      });
    },
  );
}