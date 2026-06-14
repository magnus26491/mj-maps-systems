/**
 * services/api/routes/location.ts
 * Fastify port of the GPS location ping endpoint.
 *
 * POST /api/v1/location — driver GPS ping (every 10 s)
 * Inserts into driver_locations (full history) + Redis mirror (60 s TTL)
 * + publishes to fleet:locations pub/sub channel for live dispatcher map.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { redis } from '../../cache/index.js';

export async function locationRoute(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/location',
    { preHandler: [requireAuth] },
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

      return reply.code(204).send();
    },
  );
}
