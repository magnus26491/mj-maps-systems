/**
 * Location ping endpoint
 * ---------------------
 * POST /api/v1/location — driver GPS ping (every 10s)
 * Upserts driver_locations table + Redis mirror (60s TTL).
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';
import { redis } from '../../services/cache';

export const locationRouter = Router();

interface LocationBody {
  lat?: number;
  lng?: number;
  heading?: number;
  speedKmh?: number;
  routeId?: string;
}

// ── POST /api/v1/location ───────────────────────────────────────────────────
locationRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as LocationBody;
  const { lat, lng, heading, speedKmh, routeId } = body;

  // Validate lat
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    res.status(400).json({ success: false, error: 'Invalid lat: must be a finite number between -90 and 90.' });
    return;
  }

  // Validate lng
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    res.status(400).json({ success: false, error: 'Invalid lng: must be a finite number between -180 and 180.' });
    return;
  }

  const driverId = req.driver?.id;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'Not authenticated.' });
    return;
  }

  const recordedAt = new Date().toISOString();

  // Upsert into PostgreSQL
  try {
    await pool.query(
      `INSERT INTO driver_locations (driver_id, route_id, lat, lng, heading, speed_kmh, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET
         route_id    = EXCLUDED.route_id,
         lat         = EXCLUDED.lat,
         lng         = EXCLUDED.lng,
         heading     = EXCLUDED.heading,
         speed_kmh   = EXCLUDED.speed_kmh,
         recorded_at = NOW()`,
      [driverId, routeId ?? null, lat, lng, heading ?? null, speedKmh ?? null],
    );
  } catch (err) {
    console.error('[location] DB upsert failed:', err);
    // DB failure should not break the request — still return 204
  }

  // Mirror to Redis (60s TTL)
  const redisKey = `driver:loc:${driverId}`;
  const redisValue = JSON.stringify({ lat, lng, heading, speedKmh, routeId, recordedAt });
  redis.setex(redisKey, 60, redisValue).catch((err: unknown) => {
    console.warn('[location] Redis write failed (non-fatal):', err);
  });

  res.status(204).end();
});