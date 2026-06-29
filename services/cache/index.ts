/**
 * Redis Cache Layer
 * -----------------
 * Wraps ioredis with typed helpers for:
 *   - Road segment geometry (TTL 24h) — avoids hammering Overpass API
 *   - Stop pin resolution (TTL 90d) — entrance pins rarely change
 *   - Community turn scores (TTL 1h) — aggregated from driver_reports table
 *   - Route results (TTL 30min) — for dispatcher dashboard reads
 */

import Redis from 'ioredis';
import type { RoadSegment } from '../osm-client';
import type { StopPin } from '../stop-precision';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 5000,
  commandTimeout: 5000,
});

redis.on('error', (err) => console.error('[cache] Redis error:', err.message));

export { redis };

/**
 * Creates a dedicated subscriber client for SSE / pub-sub use cases.
 * ioredis does not allow a subscribed client to issue normal commands —
 * a separate instance is required per SSE connection.
 */
export function createSubscriber(): Redis {
  const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    connectTimeout: 5000,
    commandTimeout: 5000,
  });
  sub.on('error', (err) => console.error('[cache:subscriber] Redis error:', err.message));
  return sub;
}

// ── Key builders ──────────────────────────────────────────────────────────────

const ROAD_KEY = (lat: number, lon: number) =>
  `road:${lat.toFixed(4)}:${lon.toFixed(4)}`;

const PIN_KEY = (address: string) =>
  `pin:${Buffer.from(address.toLowerCase().trim()).toString('base64').slice(0, 40)}`;

const COMMUNITY_KEY = (lat: number, lon: number) =>
  `community:${lat.toFixed(4)}:${lon.toFixed(4)}`;

const ROUTE_KEY = (routeId: string) => `route:${routeId}`;

// ── Road segment cache ────────────────────────────────────────────────────────

const ROAD_TTL = 60 * 60 * 24; // 24 hours

export async function getCachedRoadSegments(
  lat: number,
  lon: number,
): Promise<RoadSegment[] | null> {
  const raw = await redis.get(ROAD_KEY(lat, lon));
  return raw ? (JSON.parse(raw) as RoadSegment[]) : null;
}

export async function setCachedRoadSegments(
  lat: number,
  lon: number,
  segments: RoadSegment[],
): Promise<void> {
  await redis.setex(ROAD_KEY(lat, lon), ROAD_TTL, JSON.stringify(segments));
}

export async function invalidateRoadCache(lat: number, lon: number): Promise<void> {
  await redis.del(ROAD_KEY(lat, lon));
}

// ── Stop pin cache ────────────────────────────────────────────────────────────

const PIN_TTL = 60 * 60 * 24 * 90; // 90 days — 7,776,000 seconds

export async function getCachedPin(address: string): Promise<StopPin | null> {
  const raw = await redis.get(PIN_KEY(address));
  return raw ? (JSON.parse(raw) as StopPin) : null;
}

export async function setCachedPin(address: string, pin: StopPin): Promise<void> {
  await redis.setex(PIN_KEY(address), PIN_TTL, JSON.stringify(pin));
}

export async function invalidatePinCache(address: string): Promise<void> {
  await redis.del(PIN_KEY(address));
}

// ── Community score cache ─────────────────────────────────────────────────────

const COMMUNITY_TTL = 60 * 60; // 1 hour

export async function getCachedCommunityScore(
  lat: number,
  lon: number,
): Promise<number | null> {
  const raw = await redis.get(COMMUNITY_KEY(lat, lon));
  return raw ? parseFloat(raw) : null;
}

export async function setCachedCommunityScore(
  lat: number,
  lon: number,
  score: number,
): Promise<void> {
  await redis.setex(COMMUNITY_KEY(lat, lon), COMMUNITY_TTL, score.toString());
}

/** Force refresh community score (call after a new driver report is written). */
export async function invalidateCommunityScore(lat: number, lon: number): Promise<void> {
  await redis.del(COMMUNITY_KEY(lat, lon));
}

// ── Route result cache ────────────────────────────────────────────────────────

const ROUTE_TTL = 60 * 30; // 30 minutes

export async function getCachedRoute(routeId: string): Promise<unknown | null> {
  const raw = await redis.get(ROUTE_KEY(routeId));
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedRoute(routeId: string, route: unknown): Promise<void> {
  await redis.setex(ROUTE_KEY(routeId), ROUTE_TTL, JSON.stringify(route));
}

export async function invalidateRoute(routeId: string): Promise<void> {
  await redis.del(ROUTE_KEY(routeId));
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function pingCache(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
