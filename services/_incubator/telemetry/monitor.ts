/**
 * Technical Monitoring Service
 * 
 * Monitors API latency, Redis health, database latency, and service health.
 */

import { pool } from '../db/index';
import type { ServiceHealthMetric, GpsUpdateMetric } from './types';

// Redis client is imported dynamically to handle connection issues
let redisClient: any = null;

async function getRedisClient() {
  if (!redisClient) {
    try {
      const { default: Redis } = await import('ioredis');
      const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
      redisClient = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 5000 });
    } catch {
      return null;
    }
  }
  return redisClient;
}

// ─── API Health ───────────────────────────────────────────────────────────────

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate?: number;
  details?: string;
}

/**
 * Check API health (self-check)
 */
export async function checkApiHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if we can query the database (basic API function check)
    const dbResult = await pool.query('SELECT 1 as ok', []);
    
    if (dbResult.rows[0]?.ok !== 1) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        errorRate: 0.01,
        details: 'Database query returned unexpected result',
      };
    }
    
    const latencyMs = Date.now() - start;
    
    if (latencyMs < 100) {
      return { status: 'healthy', latencyMs };
    } else if (latencyMs < 500) {
      return { status: 'degraded', latencyMs, details: 'Slow response time' };
    } else {
      return { status: 'unhealthy', latencyMs, details: 'Response time exceeded threshold' };
    }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ─── Redis Health ─────────────────────────────────────────────────────────────

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  const redis = await getRedisClient();
  
  if (!redis) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: 'Redis client not available',
    };
  }
  
  try {
    await redis.ping();
    const latencyMs = Date.now() - start;
    
    if (latencyMs < 50) {
      return { status: 'healthy', latencyMs };
    } else if (latencyMs < 200) {
      return { status: 'degraded', latencyMs, details: 'Slow response' };
    } else {
      return { status: 'unhealthy', latencyMs, details: 'Response time exceeded threshold' };
    }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

// ─── Database Health ───────────────────────────────────────────────────────────

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Run several checks
    const [check1, check2, check3] = await Promise.all([
      pool.query('SELECT 1'),
      pool.query('SELECT pg_database_size(current_database()) as size'),
      pool.query('SELECT COUNT(*) as connections FROM pg_stat_activity WHERE datname = current_database()'),
    ]);
    
    const latencyMs = Date.now() - start;
    const connections = Number(check3.rows[0]?.connections ?? 0);
    
    // Check if connection pool is healthy
    if (connections > 80) {
      return {
        status: 'degraded',
        latencyMs,
        details: `High connection count: ${connections}`,
      };
    }
    
    if (latencyMs < 50) {
      return { status: 'healthy', latencyMs };
    } else if (latencyMs < 200) {
      return { status: 'degraded', latencyMs, details: 'Slow queries' };
    } else {
      return { status: 'unhealthy', latencyMs, details: 'Query time exceeded threshold' };
    }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: err instanceof Error ? err.message : 'Database error',
    };
  }
}

// ─── Queue Health ──────────────────────────────────────────────────────────────

/**
 * Check queue health (simulated - would connect to actual queue)
 */
export async function checkQueueHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // In a real implementation, this would check Redis queue or a message broker
    const redis = await getRedisClient();
    
    if (!redis) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        errorRate: 1.0,
        details: 'Queue backend not available',
      };
    }
    
    // Check queue length
    const queueKeys = await redis.keys('queue:*');
    
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: `${queueKeys.length} queues monitored`,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: err instanceof Error ? err.message : 'Queue check failed',
    };
  }
}

// ─── GPS Update Health ────────────────────────────────────────────────────────

/**
 * Check GPS update success rate
 */
export async function checkGpsHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check recent GPS updates
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE recorded_at >= NOW() - INTERVAL '5 minutes') as recent
      FROM driver_locations
    `);
    
    const latencyMs = Date.now() - start;
    const recent = Number(result.rows[0]?.recent ?? 0);
    
    // GPS health is based on recent activity
    if (recent > 0) {
      return {
        status: 'healthy',
        latencyMs,
        details: `${recent} GPS updates in last 5 minutes`,
      };
    } else {
      return {
        status: 'degraded',
        latencyMs,
        details: 'No recent GPS updates',
      };
    }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      errorRate: 1.0,
      details: err instanceof Error ? err.message : 'GPS check failed',
    };
  }
}

// ─── Combined Status ─────────────────────────────────────────────────────────

export interface ServiceStatus {
  api: HealthCheckResult;
  redis: HealthCheckResult;
  database: HealthCheckResult;
  queue: HealthCheckResult;
  gps: HealthCheckResult;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checkedAt: Date;
}

/**
 * Get overall service status
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  const [api, redis, database, queue, gps] = await Promise.all([
    checkApiHealth(),
    checkRedisHealth(),
    checkDatabaseHealth(),
    checkQueueHealth(),
    checkGpsHealth(),
  ]);
  
  // Determine overall status
  const statuses = [api, redis, database, queue, gps];
  const unhealthyCount = statuses.filter(s => s.status === 'unhealthy').length;
  const degradedCount = statuses.filter(s => s.status === 'degraded').length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthyCount > 0) {
    overall = 'unhealthy';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }
  
  return {
    api,
    redis,
    database,
    queue,
    gps,
    overall,
    checkedAt: new Date(),
  };
}

// ─── GPS Metrics ───────────────────────────────────────────────────────────────

/**
 * Track GPS update metrics
 */
export async function trackGpsUpdate(metric: GpsUpdateMetric): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO gps_metrics (
        driver_id, route_id, timestamp, success, latency_ms, error
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      metric.driverId,
      metric.routeId ?? null,
      metric.timestamp,
      metric.success,
      metric.latencyMs ?? null,
      metric.error ?? null,
    ]);
  } catch (err) {
    console.error('[telemetry] Failed to track GPS metric:', err);
  }
}

/**
 * Get GPS update success rate
 */
export async function getGpsSuccessRate(periodMinutes: number = 60): Promise<number> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success = true) as successful
    FROM gps_metrics
    WHERE timestamp >= NOW() - INTERVAL '${periodMinutes} minutes'
  `);
  
  const total = Number(result.rows[0]?.total ?? 0);
  const successful = Number(result.rows[0]?.successful ?? 0);
  
  return total > 0 ? Math.round((successful / total) * 1000) / 10 : 0;
}

// ─── Latency Tracking ──────────────────────────────────────────────────────────

export interface LatencyRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  timestamp: Date;
  error?: string;
}

/**
 * Record API latency
 */
export async function recordApiLatency(record: LatencyRecord): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO api_latency (
        endpoint, method, status_code, latency_ms, timestamp, error
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      record.endpoint,
      record.method,
      record.statusCode,
      record.latencyMs,
      record.timestamp,
      record.error ?? null,
    ]);
  } catch (err) {
    console.error('[telemetry] Failed to record latency:', err);
  }
}

/**
 * Get latency statistics for an endpoint
 */
export async function getLatencyStats(
  endpoint: string,
  periodMinutes: number = 60
): Promise<{
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
}> {
  const result = await pool.query(`
    SELECT 
      AVG(latency_ms) as avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
      COUNT(*) FILTER (WHERE status_code >= 400)::float / GREATEST(COUNT(*), 1) as error_rate
    FROM api_latency
    WHERE endpoint = $1
      AND timestamp >= NOW() - INTERVAL '${periodMinutes} minutes'
  `, [endpoint]);
  
  const row = result.rows[0] ?? {};
  
  return {
    avg: Math.round(Number(row.avg) * 10) / 10 || 0,
    p50: Math.round(Number(row.p50) * 10) / 10 || 0,
    p95: Math.round(Number(row.p95) * 10) / 10 || 0,
    p99: Math.round(Number(row.p99) * 10) / 10 || 0,
    errorRate: Math.round(Number(row.error_rate) * 1000) / 10 || 0,
  };
}
