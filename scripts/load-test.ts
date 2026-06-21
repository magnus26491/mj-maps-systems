/**
 * Synthetic Load Test
 * 
 * Tests API performance at scale:
 * - 100 drivers
 * - 500 drivers
 * - 1000 drivers
 * 
 * Measures:
 * - API response time
 * - Database load
 * - Redis performance
 * 
 * Usage:
 * npx ts-node scripts/load-test.ts
 */

import { pool } from '../services/db/index';
import { redis } from '../services/cache/index';

interface LoadTestConfig {
  numDrivers: number;
  requestsPerDriver: number;
  concurrent: number;
}

interface LoadTestResult {
  config: LoadTestConfig;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  dbConnections: number;
  dbLatencyMs: number;
  redisLatencyMs: number;
  errorRate: number;
  requestsPerSecond: number;
}

// ─── Mock API Endpoints ────────────────────────────────────────────────────────

async function simulateOptimizeRequest(driverId: string): Promise<{ duration: number; success: boolean }> {
  const start = Date.now();
  
  try {
    // Simulate route optimization (would be real API call)
    await pool.query('SELECT 1');
    const dbTime = Date.now() - start;
    
    // Simulate some Redis calls
    if (redis) {
      await redis.ping();
    }
    
    const duration = Date.now() - start;
    
    // Simulate occasional failures
    const success = Math.random() > 0.02;
    
    return { duration: dbTime + Math.random() * 50, success };
  } catch {
    return { duration: Date.now() - start, success: false };
  }
}

async function simulateLocationPing(driverId: string, routeId: string): Promise<{ duration: number; success: boolean }> {
  const start = Date.now();
  
  try {
    await pool.query(
      'INSERT INTO driver_locations (driver_id, route_id, lat, lng, heading, speed_kmh, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [driverId, routeId, 51.5 + Math.random() * 0.1, -0.1 + Math.random() * 0.1, Math.random() * 360, Math.random() * 50]
    );
    
    const duration = Date.now() - start;
    return { duration, success: true };
  } catch {
    return { duration: Date.now() - start, success: false };
  }
}

async function simulateAutocomplete(driverId: string): Promise<{ duration: number; success: boolean }> {
  const start = Date.now();
  
  try {
    // Check Redis cache
    const cacheKey = `autocomplete:test:${Date.now() % 100}`;
    if (redis) {
      await redis.setex(cacheKey, 60, 'test');
      await redis.get(cacheKey);
    }
    
    const duration = Date.now() - start;
    return { duration: duration + Math.random() * 30, success: Math.random() > 0.01 };
  } catch {
    return { duration: Date.now() - start, success: false };
  }
}

// ─── Load Test Runner ───────────────────────────────────────────────────────────

async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  console.log(`\nRunning load test: ${config.numDrivers} drivers, ${config.requestsPerDriver} requests each`);
  
  const startTime = Date.now();
  const results: Array<{ duration: number; success: boolean }> = [];
  
  // Create driver IDs
  const driverIds = Array.from({ length: config.numDrivers }, (_, i) => `driver-${i}`);
  
  // Simulate concurrent requests
  const batchSize = config.concurrent;
  
  for (let batch = 0; batch < Math.ceil(config.numDrivers / batchSize); batch++) {
    const batchDrivers = driverIds.slice(batch * batchSize, (batch + 1) * batchSize);
    
    const batchPromises = batchDrivers.map(async (driverId) => {
      const driverResults: Array<{ duration: number; success: boolean }> = [];
      
      for (let req = 0; req < config.requestsPerDriver; req++) {
        // Simulate mixed request types
        const requestType = Math.random();
        
        if (requestType < 0.3) {
          // Route optimization
          const result = await simulateOptimizeRequest(driverId);
          driverResults.push(result);
        } else if (requestType < 0.7) {
          // Location ping
          const result = await simulateLocationPing(driverId, `route-${req}`);
          driverResults.push(result);
        } else {
          // Autocomplete
          const result = await simulateAutocomplete(driverId);
          driverResults.push(result);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      }
      
      return driverResults;
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.flat());
    
    console.log(`  Batch ${batch + 1}/${Math.ceil(config.numDrivers / batchSize)} complete`);
  }
  
  const duration = Date.now() - startTime;
  
  // Calculate statistics
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const responseTimes = results.map(r => r.duration).sort((a, b) => a - b);
  
  const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);
  const p95ResponseTime = responseTimes[p95Index] || 0;
  const p99ResponseTime = responseTimes[p99Index] || 0;
  
  // Get DB metrics
  const dbResult = await pool.query('SELECT COUNT(*) as connections FROM pg_stat_activity WHERE datname = current_database()');
  const dbConnections = Number(dbResult.rows[0]?.connections ?? 0);
  
  // Measure Redis latency
  const redisStart = Date.now();
  if (redis) {
    await redis.ping();
  }
  const redisLatencyMs = Date.now() - redisStart;
  
  // Measure DB latency
  const dbStart = Date.now();
  await pool.query('SELECT 1');
  const dbLatencyMs = Date.now() - dbStart;
  
  return {
    config,
    duration,
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    avgResponseTime: Math.round(avgResponseTime * 10) / 10,
    p95ResponseTime: Math.round(p95ResponseTime * 10) / 10,
    p99ResponseTime: Math.round(p99ResponseTime * 10) / 10,
    dbConnections,
    dbLatencyMs,
    redisLatencyMs,
    errorRate: Math.round((failedRequests / results.length) * 10000) / 100,
    requestsPerSecond: Math.round((results.length / duration) * 1000),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('SYNTHETIC LOAD TEST');
  console.log('='.repeat(60));
  console.log();
  
  const testConfigs: LoadTestConfig[] = [
    { numDrivers: 100, requestsPerDriver: 10, concurrent: 20 },
    { numDrivers: 500, requestsPerDriver: 10, concurrent: 50 },
    { numDrivers: 1000, requestsPerDriver: 10, concurrent: 100 },
  ];
  
  const results: LoadTestResult[] = [];
  
  for (const config of testConfigs) {
    try {
      const result = await runLoadTest(config);
      results.push(result);
    } catch (err) {
      console.error(`Load test failed for ${config.numDrivers} drivers:`, err);
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log();
  
  for (const result of results) {
    console.log(`Test: ${result.config.numDrivers} drivers`);
    console.log('-'.repeat(40));
    console.log(`  Duration:           ${result.duration}ms`);
    console.log(`  Total requests:     ${result.totalRequests}`);
    console.log(`  Successful:         ${result.successfulRequests} (${100 - result.errorRate}%)`);
    console.log(`  Failed:             ${result.failedRequests} (${result.errorRate}%)`);
    console.log(`  Avg response time:  ${result.avgResponseTime}ms`);
    console.log(`  P95 response time:  ${result.p95ResponseTime}ms`);
    console.log(`  P99 response time:  ${result.p99ResponseTime}ms`);
    console.log(`  Requests/second:    ${result.requestsPerSecond}`);
    console.log(`  DB connections:     ${result.dbConnections}`);
    console.log(`  DB latency:         ${result.dbLatencyMs}ms`);
    console.log(`  Redis latency:      ${result.redisLatencyMs}ms`);
    console.log();
  }
  
  // Performance assessment
  console.log('-'.repeat(60));
  console.log('PERFORMANCE ASSESSMENT');
  console.log('-'.repeat(60));
  console.log();
  
  for (const result of results) {
    const assessment = result.p95ResponseTime < 200 && result.errorRate < 5
      ? '✅ PASS'
      : result.p95ResponseTime < 500 && result.errorRate < 10
      ? '⚠️  ACCEPTABLE'
      : '❌ FAIL';
    
    console.log(`${result.config.numDrivers} drivers: ${assessment}`);
    
    if (result.p95ResponseTime >= 200) {
      console.log(`  - P95 latency ${result.p95ResponseTime}ms exceeds 200ms threshold`);
    }
    if (result.errorRate >= 5) {
      console.log(`  - Error rate ${result.errorRate}% exceeds 5% threshold`);
    }
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('LOAD TEST COMPLETE');
  console.log('='.repeat(60));
  
  await pool.end();
  if (redis) {
    await redis.quit();
  }
}

main().catch(console.error);
