/**
 * GET /api/v1/dispatcher/fleet-stream
 *
 * Server-Sent Events stream for the dispatcher live map.
 * Emits the latest GPS position of every active driver every 5 seconds.
 *
 * Event format:
 *   event: location
 *   data: { driverId, driverName, lat, lng, heading, speedKmh, routeId, recordedAt }
 *
 *   event: heartbeat
 *   data: { ts }        (every 15 s — keeps proxies from killing idle connections)
 *
 * Stage 4: Live fleet map for dispatchers.
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

const POLL_INTERVAL_MS  = 5_000;
const HEARTBEAT_MS      = 15_000;
const LOOKBACK_SECONDS  = 30;   // only drivers active in the last 30 s

export const fleetStreamRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/dispatcher/fleet-stream',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] },
    async (request, reply) => {
      const raw = reply.raw;

      raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',   // disable nginx proxy buffering
      });

      const send = (event: string, data: unknown) => {
        if (raw.writableEnded) return;
        raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const poll = async () => {
        if (raw.writableEnded) return;
        try {
          const { rows } = await pool.query(
            `SELECT
               dl.driver_id        AS "driverId",
               u.name              AS "driverName",
               dl.lat,
               dl.lng,
               dl.heading,
               dl.speed_kmh        AS "speedKmh",
               dl.route_id         AS "routeId",
               dl.recorded_at      AS "recordedAt"
             FROM driver_locations dl
             JOIN users u ON u.id = dl.driver_id
             WHERE dl.recorded_at > NOW() - ($1 * INTERVAL '1 second')
               AND dl.recorded_at = (
                 SELECT MAX(dl2.recorded_at)
                 FROM driver_locations dl2
                 WHERE dl2.driver_id = dl.driver_id
               )
             ORDER BY dl.recorded_at DESC
             LIMIT 200`,
            [LOOKBACK_SECONDS],
          );
          for (const row of rows) {
            send('location', row);
          }
        } catch {
          // non-fatal — client will retry on reconnect
        }
      };

      // Initial push immediately, then on interval
      await poll();

      const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => {
        send('heartbeat', { ts: Date.now() });
      }, HEARTBEAT_MS);

      // Clean up when client disconnects
      request.raw.on('close', () => {
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        if (!raw.writableEnded) raw.end();
      });

      // Keep the request open (Fastify's reply.send() would close it)
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
      });
    },
  );
};
