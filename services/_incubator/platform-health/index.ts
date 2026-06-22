/**
 * Platform Health Monitoring Service
 * 
 * Monitors the health of all MJ Maps platform components.
 * Provides alerts for production monitoring.
 */

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  components: ComponentHealth[];
}

export interface ComponentHealth {
  name: string;
  status: 'up' | 'down' | 'unknown';
  latencyMs?: number;
  error?: string;
  lastCheck: string;
}

export interface MonitoringMetrics {
  website: {
    uptime: number;
    assetFailures: number;
  };
  driverApp: {
    crashEvents: number;
    routeFailures: number;
    gpsFailures: number;
    navigationLaunchFailures: number;
  };
  api: {
    avgResponseLatencyMs: number;
    authFailures: number;
    failedReplans: number;
  };
}

// ─── Health Checks ─────────────────────────────────────────────────────────────

/**
 * Check website health
 */
export async function checkWebsiteHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  
  try {
    // In production, this would check actual endpoints
    const latencyMs = Date.now() - start;
    
    return {
      name: 'website',
      status: 'up',
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'website',
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Check API health
 */
export async function checkApiHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  
  try {
    // In production, this would hit /api/v1/health
    const latencyMs = Date.now() - start;
    
    return {
      name: 'api',
      status: 'up',
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'api',
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  
  try {
    // In production, this would run a simple query
    const latencyMs = Date.now() - start;
    
    return {
      name: 'database',
      status: 'up',
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  
  try {
    // In production, this would ping Redis
    const latencyMs = Date.now() - start;
    
    return {
      name: 'redis',
      status: 'up',
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Get overall platform health
 */
export async function getPlatformHealth(): Promise<HealthStatus> {
  const components = await Promise.all([
    checkWebsiteHealth(),
    checkApiHealth(),
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);
  
  const downCount = components.filter(c => c.status === 'down').length;
  const degradedCount = components.filter(c => c.status === 'unknown').length;
  
  let status: HealthStatus['status'] = 'healthy';
  if (downCount > 0) {
    status = 'down';
  } else if (degradedCount > 0) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: new Date().toISOString(),
    components,
  };
}

// ─── Metrics Collection ────────────────────────────────────────────────────────

/**
 * Record a metric event
 */
export function recordMetric(
  category: keyof MonitoringMetrics,
  event: string,
  value: number = 1
): void {
  // In production, this would write to a metrics store
  console.log(`[metrics] ${category}.${event}=${value}`);
}

/**
 * Get recent metrics summary
 */
export async function getMetricsSummary(): Promise<MonitoringMetrics> {
  // In production, this would query metrics store
  return {
    website: {
      uptime: 99.9,
      assetFailures: 0,
    },
    driverApp: {
      crashEvents: 0,
      routeFailures: 0,
      gpsFailures: 0,
      navigationLaunchFailures: 0,
    },
    api: {
      avgResponseLatencyMs: 150,
      authFailures: 0,
      failedReplans: 0,
    },
  };
}

// ─── Alerting ─────────────────────────────────────────────────────────────────

/**
 * Check if an alert should be raised
 */
export function shouldAlert(health: HealthStatus): boolean {
  // Alert if any component is down
  if (health.status === 'down') {
    return true;
  }
  
  // Alert if API latency is high
  const apiComponent = health.components.find(c => c.name === 'api');
  if (apiComponent && apiComponent.latencyMs && apiComponent.latencyMs > 1000) {
    return true;
  }
  
  return false;
}

/**
 * Generate alert message
 */
export function generateAlertMessage(health: HealthStatus): string {
  const downComponents = health.components
    .filter(c => c.status === 'down')
    .map(c => c.name)
    .join(', ');
  
  if (downComponents) {
    return `MJ Maps Alert: Components down: ${downComponents}`;
  }
  
  return 'MJ Maps Alert: Platform degraded';
}
