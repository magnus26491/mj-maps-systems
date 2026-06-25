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
            `SELECT DISTINCT ON (dl.driver_id)
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
             WHERE dl.recorded_at > NOW() - make_interval(secs => $1)
             ORDER BY dl.driver_id, dl.recorded_at DESC
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

      // Register cleanup BEFORE the initial await poll() so a client that
      // disconnects during the first DB query still clears the timers.
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

      const closePromise = new Promise<void>((resolve) => {
        request.raw.once('close', () => {
          if (pollTimer !== undefined) clearInterval(pollTimer);
          if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
          if (!raw.writableEnded) raw.end();
          resolve();
        });
      });

      // Initial push immediately, then on interval
      await poll();
      if (raw.writableEnded) return;

      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      heartbeatTimer = setInterval(() => {
        send('heartbeat', { ts: Date.now() });
      }, HEARTBEAT_MS);

      // Keep the request open (Fastify's reply.send() would close it)
      await closePromise;
    },
  );
};
