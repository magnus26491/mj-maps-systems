/**
 * MJ Maps Systems — Redis Cache Layer
 *
 * Caches Overpass/OSM responses to eliminate redundant API calls.
 *
 * TTLs:
 *  - Building polygon data  : 7 days   (building geometry rarely changes)
 *  - Road width/restriction : 3 days   (road works, closures)
 *  - Turn score             : 1 hour   (community reports update frequently)
 *  - Stop intelligence      : 24 hours (driver notes, access instructions)
 *
 * Key schema:
 *  building:{lat6}:{lng6}         → OsmBuildingData JSON
 *  road:{wayId}                   → RoadProfile JSON
 *  turn:{lat6}:{lng6}:{vehicleId} → TurnScore JSON
 *  stop:{propertyId}              → StopIntelligence JSON
 *
 * Lat/lng are rounded to 6 decimal places (~11cm precision) for key stability.
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
  keyPrefix?: string; // default: 'mjmaps:'
}

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
  hitRate: string;
}

// ─── TTL CONSTANTS ───────────────────────────────────────────────────────────

export const TTL = {
  BUILDING:  60 * 60 * 24 * 7,  // 7 days
  ROAD:      60 * 60 * 24 * 3,  // 3 days
  TURN:      60 * 60,            // 1 hour
  STOP:      60 * 60 * 24,       // 24 hours
  ROUTE:     60 * 5,             // 5 minutes (live route cache)
} as const;

export type CacheDomain = keyof typeof TTL;

// ─── KEY HELPERS ─────────────────────────────────────────────────────────────

function geoKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

export const CacheKey = {
  building:  (lat: number, lng: number)                 => `building:${geoKey(lat, lng)}`,
  road:      (wayId: number)                             => `road:${wayId}`,
  turn:      (lat: number, lng: number, vId: string)     => `turn:${geoKey(lat, lng)}:${vId}`,
  stop:      (propertyId: string)                        => `stop:${encodeURIComponent(propertyId)}`,
  route:     (routeId: string)                           => `route:${routeId}`,
};

// ─── CLIENT WRAPPER ──────────────────────────────────────────────────────────

/**
 * Thin Redis client wrapper.
 * We avoid importing ioredis directly to keep this file testable without
 * a live Redis connection — inject any redis-compatible client.
 *
 * Compatible with ioredis, @upstash/redis, and redis (node-redis v4).
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}

export class MJMapsCache {
  private redis: RedisLike;
  private prefix: string;
  private stats: CacheStats = { hits: 0, misses: 0, writes: 0, errors: 0, hitRate: '0%' };

  constructor(redis: RedisLike, prefix = 'mjmaps:') {
    this.redis  = redis;
    this.prefix = prefix;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total ? `${Math.round((this.stats.hits / total) * 100)}%` : '0%';
  }

  // ── GET ────────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.k(key));
      if (raw == null) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }
      this.stats.hits++;
      this.updateHitRate();
      return JSON.parse(raw) as T;
    } catch (err) {
      this.stats.errors++;
      console.error(`[cache] GET error for key ${key}:`, err);
      return null; // graceful degradation — never throw on cache miss
    }
  }

  // ── SET ────────────────────────────────────────────────────────────────────

  async set<T>(key: string, value: T, domain: CacheDomain): Promise<void> {
    try {
      await this.redis.set(this.k(key), JSON.stringify(value), 'EX', TTL[domain]);
      this.stats.writes++;
    } catch (err) {
      this.stats.errors++;
      console.error(`[cache] SET error for key ${key}:`, err);
      // Do not throw — cache write failure must not break the main flow
    }
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(this.k(key));
    } catch (err) {
      console.error(`[cache] DEL error for key ${key}:`, err);
    }
  }

  // ── WRAPPED GET-OR-FETCH ───────────────────────────────────────────────────

  /**
   * Cache-aside helper. Attempts to read from cache; on miss, calls
   * fetcher(), stores the result, and returns it.
   *
   * Never throws on cache errors — always falls back to fetcher().
   *
   * @example
   * const building = await cache.getOrFetch(
   *   CacheKey.building(lat, lng),
   *   'BUILDING',
   *   () => getBuildingContext(lat, lng),
   * );
   */
  async getOrFetch<T>(
    key: string,
    domain: CacheDomain,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, domain);
    }
    return fresh;
  }

  // ── HEALTH / STATS ─────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  getStats(): Readonly<CacheStats> {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, writes: 0, errors: 0, hitRate: '0%' };
  }
}
