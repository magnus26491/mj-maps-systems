/**
 * services/api/routes/location.ts
 * Fastify port of the GPS location ping endpoint.
 *
 * POST /api/v1/location — driver GPS ping (every 10 s)
 * Inserts into driver_locations (full history) + Redis mirror (60 s TTL)
 * + publishes to fleet:locations pub/sub channel for live dispatcher map.
 * + detects route deviation >250m and fires OFF_ROUTE Telegram alert (5-min dedup).
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { redis } from '../../cache/index.js';

const OFF_ROUTE_THRESHOLD_M = 250;
const OFF_ROUTE_DEDUP_TTL_S = 300; // 5 minutes

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function detectOffRoute(
  driverId: string,
  lat: number,
  lng: number,
  routeId: string,
): Promise<void> {
  // Load route polyline
  const { rows } = await pool.query(
    `SELECT polyline_json FROM routes WHERE id = $1 AND status = 'active' LIMIT 1`,
    [routeId],
  );
  const polylineJson = rows[0]?.polyline_json;
  if (!polylineJson) return;

  let polyline: { lat: number; lng: number }[];
  try { polyline = JSON.parse(polylineJson); } catch { return; }
  if (!polyline.length) return;

  // Check minimum distance from driver to any polyline point
  let minDist = Infinity;
  for (const pt of polyline) {
    const d = haversineM(lat, lng, pt.lat, pt.lng);
    if (d < minDist) minDist = d;
    if (minDist <= OFF_ROUTE_THRESHOLD_M) return; // within route — no alert
  }

  // Driver is off route — deduplicate alerts
  const dedupeKey = `offroute:alerted:${driverId}`;
  const alreadyAlerted = await redis.get(dedupeKey).catch(() => null);
  if (alreadyAlerted) return;

  await redis.setex(dedupeKey, OFF_ROUTE_DEDUP_TTL_S, '1').catch(() => {});

  // Deliver OFF_ROUTE alert via WebSocket to the driver's HUD (Layer 1)
  const { broadcastToDriver } = await import('../driver-api.js');
  broadcastToDriver(driverId, {
    type:    'OFF_ROUTE_ALERT',
    routeId,
    message: 'You have deviated from the planned route. Recalculating…',
    ts:      Date.now(),
  });
}

export async function locationRoute(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/location',
    {
      preHandler: [requireAuth],
      // max 30 pings per minute per driver (one every 2 seconds)
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (req: any) => (req as any).authUser?.id ?? req.ip,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        lat?: unknown;
        lng?: unknown;
        heading?: unknown;
        speedKmh?: unknown;
        routeId?: unknown;
      };

      const { lat, lng, heading, speedKmh, routeId } = body;

      // Validate lat
      if (
        typeof lat !== 'number' ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90
      ) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid lat: must be a finite number between -90 and 90.',
        });
      }

      // Validate lng
      if (
        typeof lng !== 'number' ||
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180
      ) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid lng: must be a finite number between -180 and 180.',
        });
      }

      const driverId = (request as unknown as { authUser?: { id?: string } }).authUser?.id;
      if (!driverId) {
        return reply.code(401).send({ success: false, error: 'Not authenticated.' });
      }

      const recordedAt = new Date().toISOString();

      // Insert into PostgreSQL (full history)
      try {
        await pool.query(
          `INSERT INTO driver_locations (driver_id, route_id, lat, lng, heading, speed_kmh, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            driverId,
            typeof routeId === 'string' ? routeId : null,
            lat,
            lng,
            typeof heading === 'number' ? heading : null,
            typeof speedKmh === 'number' ? speedKmh : null,
          ],
        );
      } catch (err) {
        console.error('[location] DB insert failed:', err);
        // DB failure is non-fatal — still return 204
      }

      // Mirror to Redis (60 s TTL)
      const redisKey   = `driver:loc:${driverId}`;
      const redisValue = JSON.stringify({ lat, lng, heading, speedKmh, routeId, recordedAt });
      redis.setex(redisKey, 60, redisValue).catch((err: unknown) => {
        console.warn('[location] Redis write failed (non-fatal):', err);
      });

      // Publish live location to SSE/dispatcher subscribers
      redis
        .publish(
          'fleet:locations',
          JSON.stringify({
            driverId,
            lat,
            lng,
            heading:   typeof heading  === 'number' ? heading  : null,
            speedKmh:  typeof speedKmh === 'number' ? speedKmh : null,
            routeId:   typeof routeId  === 'string' ? routeId  : null,
            recordedAt,
          }),
        )
        .catch((err: unknown) => {
          console.warn('[location] Redis publish failed (non-fatal):', err);
        });

      // OFF_ROUTE detection — fire-and-forget, never blocks the response
      if (typeof routeId === 'string') {
        detectOffRoute(driverId, lat, lng, routeId).catch(() => {});
      }

      return reply.code(204).send();
    },
  );
}
