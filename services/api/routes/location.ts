/**
 * services/api/routes/location.ts
 * GPS location ping endpoint for Fastify.
 *
 * POST /api/v1/location — driver GPS ping (every 10s)
 * Inserts into driver_locations (full history) + Redis mirror (60s TTL).
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { redis } from '../../cache/index.js';

interface LocationBody {
  lat?: number;
  lng?: number;
  heading?: number;
  speedKmh?: number;
  routeId?: string;
}

export async function locationRoute(server: FastifyInstance): Promise<void> {
  // ── POST /api/v1/location ───────────────────────────────────────────────────
  server.post<{ Body: LocationBody }>(
    '/api/v1/location',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = request.body as LocationBody;
      const { lat, lng, heading, speedKmh, routeId } = body;

      // Validate lat
      if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid lat: must be a finite number between -90 and 90.',
        });
      }

      // Validate lng
      if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid lng: must be a finite number between -180 and 180.',
        });
      }

      const driverId = (request.user as { sub?: string })?.sub;
      if (!driverId) {
        return reply.code(401).send({ success: false, error: 'Not authenticated.' });
      }

      const recordedAt = new Date().toISOString();

      // Insert into PostgreSQL (full history — composite PK allows multiple rows per driver)
      try {
        await pool.query(
          `INSERT INTO driver_locations (driver_id, route_id, lat, lng, heading, speed_kmh, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [driverId, routeId ?? null, lat, lng, heading ?? null, speedKmh ?? null],
        );
      } catch (err) {
        console.error('[location] DB insert failed:', err);
        // DB failure should not break the request — still return 204
      }

      // Mirror to Redis (60s TTL)
      const redisKey = `driver:loc:${driverId}`;
      const redisValue = JSON.stringify({ lat, lng, heading, speedKmh, routeId, recordedAt });
      redis.setex(redisKey, 60, redisValue).catch((err: unknown) => {
        console.warn('[location] Redis write failed (non-fatal):', err);
      });

      // Publish live location to SSE subscribers (fire-and-forget)
      redis.publish('fleet:locations', JSON.stringify({
        driverId,
        lat,
        lng,
        heading: heading ?? null,
        speedKmh: speedKmh ?? null,
        routeId: routeId ?? null,
        recordedAt,
      })).catch((err: unknown) => {
        console.warn('[location] Redis publish failed (non-fatal):', err);
      });

      return reply.code(204).send();
    },
  );
}