/**
 * Telemetry Tracker
 * 
 * Handles event collection and metric aggregation.
 */

import { pool } from '../db/index';
import { redis } from '../cache/index';
import type {
  TelemetryEvent,
  DriverEvent,
  DriverEventType,
  RouteMetric,
  ProductMetric,
  ProductEventType,
  TelemetrySummary,
} from './types';

// ─── Driver Events ─────────────────────────────────────────────────────────────

/**
 * Track a driver event
 */
export async function trackDriverEvent(event: DriverEvent): Promise<void> {
  const eventData = {
    event_type: event.eventType,
    driver_id: event.driverId,
    route_id: event.routeId ?? null,
    stop_id: event.stopId ?? null,
    timestamp: event.timestamp,
    duration_ms: event.durationMs ?? null,
    metadata: JSON.stringify(event.metadata ?? {}),
  };

  try {
    await pool.query(`
      INSERT INTO telemetry_events (
        event_type, driver_id, route_id, stop_id, 
        timestamp, duration_ms, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      eventData.event_type,
      eventData.driver_id,
      eventData.route_id,
      eventData.stop_id,
      eventData.timestamp,
      eventData.duration_ms,
      eventData.metadata,
    ]);
  } catch (err) {
    console.error('[telemetry] Failed to track driver event:', err);
    // Non-fatal - don't block the driver
  }
}

/**
 * Get driver metrics for a period
 */
export async function getDriverMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  activeDrivers: number;
  avgStopsPerHour: number;
  avgFailedDeliveries: number;
  replanAcceptanceRate: number;
  voiceUsageRate: number;
  incidentCount: number;
  crashCount: number;
}> {
  const result = await pool.query(`
    WITH driver_events AS (
      SELECT 
        driver_id,
        event_type,
        metadata::jsonb as meta
      FROM telemetry_events
      WHERE timestamp >= $1 AND timestamp <= $2
        AND event_type IN (
          'stop_completed', 'stop_failed', 'replan_accepted', 
          'replan_rejected', 'voice_command_used', 'incident_reported', 'app_crash'
        )
    ),
    active AS (
      SELECT COUNT(DISTINCT driver_id) as count FROM driver_events
    ),
    stops AS (
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'stop_completed') as completed,
        COUNT(*) FILTER (WHERE event_type = 'stop_failed') as failed
      FROM driver_events
    ),
    replan AS (
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'replan_accepted') as accepted,
        COUNT(*) FILTER (WHERE event_type IN ('replan_accepted', 'replan_rejected')) as total
      FROM driver_events
    ),
    voice AS (
      SELECT COUNT(*) FILTER (WHERE event_type = 'voice_command_used') as usage
      FROM driver_events
    ),
    incidents AS (
      SELECT COUNT(*) FILTER (WHERE event_type = 'incident_reported') as count
      FROM driver_events
    ),
    crashes AS (
      SELECT COUNT(*) FILTER (WHERE event_type = 'app_crash') as count
      FROM driver_events
    )
    SELECT 
      (SELECT count FROM active) as active_drivers,
      COALESCE((SELECT completed FROM stops), 0) / GREATEST(EXTRACT(EPOCH FROM ($2 - $1)) / 3600, 1) as avg_stops_per_hour,
      COALESCE((SELECT failed FROM stops), 0)::float / GREATEST((SELECT completed + failed FROM stops), 1) as fail_rate,
      COALESCE((SELECT accepted FROM replan), 0)::float / GREATEST((SELECT total FROM replan), 1) as replan_rate,
      (SELECT usage FROM voice) as voice_usage,
      (SELECT count FROM incidents) as incidents,
      (SELECT count FROM crashes) as crashes
  `, [startDate, endDate]);

  const row = result.rows[0] ?? {};
  
  return {
    activeDrivers: Number(row.active_drivers) || 0,
    avgStopsPerHour: Math.round(Number(row.avg_stops_per_hour) * 10) / 10 || 0,
    avgFailedDeliveries: Math.round(Number(row.fail_rate) * 1000) / 10 || 0,
    replanAcceptanceRate: Math.round(Number(row.replan_rate) * 1000) / 10 || 0,
    voiceUsageRate: Number(row.voice_usage) || 0,
    incidentCount: Number(row.incidents) || 0,
    crashCount: Number(row.crashes) || 0,
  };
}

// ─── Route Metrics ─────────────────────────────────────────────────────────────

/**
 * Track a route metric
 */
export async function trackRouteMetric(metric: RouteMetric): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO route_metrics (
        route_id, driver_id, timestamp,
        predicted_eta, actual_eta, eta_error_minutes,
        initial_confidence, final_confidence,
        predicted_parking_difficulty, actual_parking_time_minutes,
        reorder_count, reorder_success_rate,
        navigation_override_count, navigation_total_distance,
        total_stops, completed_stops, failed_stops, completion_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      metric.routeId,
      metric.driverId,
      metric.timestamp,
      metric.predictedEta ?? null,
      metric.actualEta ?? null,
      metric.etaErrorMinutes ?? null,
      metric.initialConfidence ?? null,
      metric.finalConfidence ?? null,
      metric.predictedParkingDifficulty ?? null,
      metric.actualParkingTimeMinutes ?? null,
      metric.reorderCount ?? null,
      metric.reorderSuccessRate ?? null,
      metric.navigationOverrideCount ?? null,
      metric.navigationTotalDistance ?? null,
      metric.totalStops ?? null,
      metric.completedStops ?? null,
      metric.failedStops ?? null,
      metric.completionRate ?? null,
    ]);
  } catch (err) {
    console.error('[telemetry] Failed to track route metric:', err);
  }
}

/**
 * Get route metrics for a period
 */
export async function getRouteMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  totalRoutes: number;
  avgEtaErrorMinutes: number;
  confidenceAccuracy: number;
  parkingAccuracy: number;
  reorderSuccessRate: number;
  avgCompletionRate: number;
}> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_routes,
      AVG(ABS(eta_error_minutes)) as avg_eta_error,
      COUNT(*) FILTER (WHERE initial_confidence = final_confidence)::float / 
        GREATEST(COUNT(*) FILTER (WHERE final_confidence IS NOT NULL), 1) as confidence_accuracy,
      COUNT(*) FILTER (WHERE predicted_parking_difficulty IS NOT NULL AND actual_parking_time_minutes IS NOT NULL)::float /
        GREATEST(COUNT(*) FILTER (WHERE predicted_parking_difficulty IS NOT NULL), 1) as parking_accuracy,
      AVG(reorder_success_rate) as reorder_rate,
      AVG(completion_rate) as avg_completion
    FROM route_metrics
    WHERE timestamp >= $1 AND timestamp <= $2
  `, [startDate, endDate]);

  const row = result.rows[0] ?? {};
  
  return {
    totalRoutes: Number(row.total_routes) || 0,
    avgEtaErrorMinutes: Math.round(Number(row.avg_eta_error) * 10) / 10 || 0,
    confidenceAccuracy: Math.round(Number(row.confidence_accuracy) * 1000) / 10 || 0,
    parkingAccuracy: Math.round(Number(row.parking_accuracy) * 1000) / 10 || 0,
    reorderSuccessRate: Math.round(Number(row.reorder_rate) * 1000) / 10 || 0,
    avgCompletionRate: Math.round(Number(row.avg_completion) * 1000) / 10 || 0,
  };
}

// ─── Product Metrics ───────────────────────────────────────────────────────────

/**
 * Track a product event
 */
export async function trackProductMetric(metric: ProductMetric): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO product_metrics (
        event_type, user_id, driver_id, timestamp,
        from_plan, to_plan, plan,
        features, route_id, stops_count,
        source, utm_campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      metric.eventType,
      metric.userId ?? null,
      metric.driverId ?? null,
      metric.timestamp,
      metric.fromPlan ?? null,
      metric.toPlan ?? null,
      metric.plan ?? null,
      JSON.stringify(metric.features ?? []),
      metric.routeId ?? null,
      metric.stopsCount ?? null,
      metric.source ?? null,
      metric.utmCampaign ?? null,
    ]);
  } catch (err) {
    console.error('[telemetry] Failed to track product metric:', err);
  }
}

/**
 * Get product metrics for a period
 */
export async function getProductMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  totalDrivers: number;
  freeDrivers: number;
  proDrivers: number;
  enterpriseDrivers: number;
  freeToProConversions: number;
  avgStopsPerDay: number;
  topFeatures: Array<{ feature: string; usageCount: number }>;
}> {
  const [driversResult, conversionsResult, routesResult, featuresResult] = await Promise.all([
    pool.query(`
      SELECT plan, COUNT(*) as count
      FROM drivers
      WHERE created_at <= $2
      GROUP BY plan
    `, [startDate, endDate]),
    
    pool.query(`
      SELECT COUNT(*) as conversions
      FROM product_metrics
      WHERE timestamp >= $1 AND timestamp <= $2
        AND event_type = 'plan_upgrade'
        AND from_plan = 'free' AND to_plan = 'pro'
    `, [startDate, endDate]),
    
    pool.query(`
      SELECT AVG(stops_count) as avg_stops
      FROM product_metrics
      WHERE timestamp >= $1 AND timestamp <= $2
        AND event_type = 'route_created'
        AND stops_count IS NOT NULL
    `, [startDate, endDate]),
    
    pool.query(`
      SELECT feature, SUM(usage_count) as total
      FROM (
        SELECT jsonb_array_elements_text(features) as feature, 1 as usage_count
        FROM product_metrics
        WHERE timestamp >= $1 AND timestamp <= $2
          AND event_type = 'feature_used'
          AND features IS NOT NULL
      ) f
      GROUP BY feature
      ORDER BY total DESC
      LIMIT 10
    `, [startDate, endDate]),
  ]);

  const planCounts: Record<string, number> = {};
  let totalDrivers = 0;
  for (const row of driversResult.rows) {
    const plan = row.plan ?? 'free';
    planCounts[plan] = Number(row.count);
    totalDrivers += Number(row.count);
  }

  const topFeatures = featuresResult.rows.map(r => ({
    feature: r.feature,
    usageCount: Number(r.total),
  }));

  return {
    totalDrivers,
    freeDrivers: planCounts['free'] ?? 0,
    proDrivers: planCounts['pro'] ?? 0,
    enterpriseDrivers: planCounts['enterprise'] ?? 0,
    freeToProConversions: Number(conversionsResult.rows[0]?.conversions) || 0,
    avgStopsPerDay: Math.round(Number(routesResult.rows[0]?.avg_stops) * 10) / 10 || 0,
    topFeatures,
  };
}

// ─── Summary Aggregation ────────────────────────────────────────────────────────

/**
 * Get comprehensive telemetry summary
 */
export async function getTelemetrySummary(
  periodDays: number = 7
): Promise<TelemetrySummary> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const [driver, routes, product] = await Promise.all([
    getDriverMetrics(startDate, endDate),
    getRouteMetrics(startDate, endDate),
    getProductMetrics(startDate, endDate),
  ]);

  // Technical metrics would come from monitoring service
  const technical = {
    apiAvgLatencyMs: 0,
    apiP99LatencyMs: 0,
    apiErrorRate: 0,
    redisStatus: 'healthy' as const,
    databaseStatus: 'healthy' as const,
    gpsUpdateSuccessRate: 0,
    queueFailureRate: 0,
  };

  return {
    generatedAt: new Date(),
    period: { start: startDate, end: endDate },
    driver,
    routes,
    product,
    technical,
  };
}
