/**
 * MJ Maps Systems — Turn Engine
 * Redis Cache Layer
 *
 * Caches TurnEngineResult by geohash (6-char = ~1.2km precision) + vehicleProfileId.
 * TTL: 24 hours for static geometry, 1 hour if closure data was factored in.
 *
 * Uses ioredis. Connection string from REDIS_URL env var.
 * Gracefully degrades if Redis is unavailable — cache miss is returned, not an error.
 */

import Redis from 'ioredis';
import type { TurnEngineResult } from './types';

/** Cache TTL in seconds */
const TTL_STATIC_S  = 60 * 60 * 24;   // 24 hours — pure road geometry
const TTL_DYNAMIC_S = 60 * 60;         // 1 hour  — when closures are factored in

const CACHE_VERSION = 'v1';

let _client: Redis | null = null;

function getClient(): Redis | null {
  if (_client) return _client;
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[turn-engine/cache] REDIS_URL not set — running without cache');
    return null;
  }
  try {
    _client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    _client.on('error', (err) => {
      console.warn('[turn-engine/cache] Redis error:', err.message);
    });
    return _client;
  } catch {
    return null;
  }
}

/**
 * Build a cache key from geohash + vehicleProfileId.
 * Geohash precision 6 = ~1.2km grid cell — acceptable for road-geometry data.
 * Keys look like: mj:turn:v1:gcpvh0:van_swb
 */
function buildKey(geohash6: string, vehicleProfileId: string): string {
  return `mj:turn:${CACHE_VERSION}:${geohash6}:${vehicleProfileId}`;
}

export async function getFromCache(
  geohash6: string,
  vehicleProfileId: string,
): Promise<TurnEngineResult | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await client.get(buildKey(geohash6, vehicleProfileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TurnEngineResult;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

export async function setInCache(
  geohash6: string,
  vehicleProfileId: string,
  result: TurnEngineResult,
  hasDynamicClosures = false,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const ttl = hasDynamicClosures ? TTL_DYNAMIC_S : TTL_STATIC_S;
  try {
    await client.set(
      buildKey(geohash6, vehicleProfileId),
      JSON.stringify(result),
      'EX',
      ttl,
    );
  } catch {
    // Swallow — cache write failure is non-fatal
  }
}

export async function invalidateLocation(
  geohash6: string,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const pattern = `mj:turn:${CACHE_VERSION}:${geohash6}:*`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // Non-fatal
  }
}
