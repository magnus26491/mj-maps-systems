/**
 * API Routes: Internal Metrics Dashboard
 * 
 * Enterprise-only internal dashboard metrics.
 * Never visible to Driver Pro.
 */

import { Router, Request, Response } from 'express';
import { getTelemetrySummary } from '../../services/telemetry/tracker';
import { getServiceStatus, getGpsSuccessRate, getLatencyStats } from '../../services/telemetry/monitor';
import { authenticateDriver } from '../middleware/authenticate';
import { requireEnterprise } from '../middleware/requireEnterprise';

export const metricsRouter = Router();

// ─── Internal Dashboard Metrics ────────────────────────────────────────────────

/**
 * GET /internal/metrics
 * 
 * Get comprehensive metrics for internal dashboard.
 * Enterprise only.
 */
metricsRouter.get('/metrics', authenticateDriver, requireEnterprise, async (_req: Request, res: Response) => {
  try {
    const summary = await getTelemetrySummary(7);
    
    res.json({
      ok: true,
      data: summary,
    });
  } catch (err) {
    console.error('[metrics] Failed to get summary:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load metrics',
    });
  }
});

/**
 * GET /internal/metrics/service
 * 
 * Get service health status.
 * Enterprise only.
 */
metricsRouter.get('/metrics/service', authenticateDriver, requireEnterprise, async (_req: Request, res: Response) => {
  try {
    const status = await getServiceStatus();
    const gpsRate = await getGpsSuccessRate(60);
    
    res.json({
      ok: true,
      data: {
        ...status,
        gpsSuccessRate: gpsRate,
      },
    });
  } catch (err) {
    console.error('[metrics] Failed to get service status:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load service status',
    });
  }
});

/**
 * GET /internal/metrics/latency
 * 
 * Get API latency statistics.
 * Enterprise only.
 */
metricsRouter.get('/metrics/latency', authenticateDriver, requireEnterprise, async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    
    if (endpoint) {
      const stats = await getLatencyStats(endpoint, 60);
      res.json({
        ok: true,
        data: {
          endpoint,
          period: '60 minutes',
          ...stats,
        },
      });
    } else {
      // Return latency for common endpoints
      const endpoints = [
        '/api/v1/optimise',
        '/api/v1/stops',
        '/api/v1/location',
        '/api/v1/auth/login',
        '/api/v1/address/autocomplete',
      ];
      
      const results = await Promise.all(
        endpoints.map(async (ep) => ({
          endpoint: ep,
          ...await getLatencyStats(ep, 60),
        }))
      );
      
      res.json({
        ok: true,
        data: {
          period: '60 minutes',
          endpoints: results,
        },
      });
    }
  } catch (err) {
    console.error('[metrics] Failed to get latency:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load latency data',
    });
  }
});

/**
 * GET /internal/metrics/drivers
 * 
 * Get driver performance metrics.
 * Enterprise only.
 */
metricsRouter.get('/metrics/drivers', authenticateDriver, requireEnterprise, async (req: Request, res: Response) => {
  try {
    const summary = await getTelemetrySummary(7);
    
    res.json({
      ok: true,
      data: {
        activeDrivers: summary.driver.activeDrivers,
        avgStopsPerHour: summary.driver.avgStopsPerHour,
        avgFailedDeliveries: summary.driver.avgFailedDeliveries,
        replanAcceptanceRate: summary.driver.replanAcceptanceRate,
        voiceUsageRate: summary.driver.voiceUsageRate,
        incidentCount: summary.driver.incidentCount,
        crashCount: summary.driver.crashCount,
      },
    });
  } catch (err) {
    console.error('[metrics] Failed to get driver metrics:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load driver metrics',
    });
  }
});

/**
 * GET /internal/metrics/routes
 * 
 * Get route performance metrics.
 * Enterprise only.
 */
metricsRouter.get('/metrics/routes', authenticateDriver, requireEnterprise, async (req: Request, res: Response) => {
  try {
    const summary = await getTelemetrySummary(7);
    
    res.json({
      ok: true,
      data: {
        totalRoutes: summary.routes.totalRoutes,
        avgEtaErrorMinutes: summary.routes.avgEtaErrorMinutes,
        confidenceAccuracy: summary.routes.confidenceAccuracy,
        parkingAccuracy: summary.routes.parkingAccuracy,
        reorderSuccessRate: summary.routes.reorderSuccessRate,
        avgCompletionRate: summary.routes.avgCompletionRate,
      },
    });
  } catch (err) {
    console.error('[metrics] Failed to get route metrics:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load route metrics',
    });
  }
});

/**
 * GET /internal/metrics/product
 * 
 * Get product and conversion metrics.
 * Enterprise only.
 */
metricsRouter.get('/metrics/product', authenticateDriver, requireEnterprise, async (req: Request, res: Response) => {
  try {
    const summary = await getTelemetrySummary(7);
    
    res.json({
      ok: true,
      data: {
        totalDrivers: summary.product.totalDrivers,
        planDistribution: {
          free: summary.product.freeDrivers,
          pro: summary.product.proDrivers,
          enterprise: summary.product.enterpriseDrivers,
        },
        freeToProConversions: summary.product.freeToProConversions,
        avgStopsPerDay: summary.product.avgStopsPerDay,
        topFeatures: summary.product.topFeatures,
      },
    });
  } catch (err) {
    console.error('[metrics] Failed to get product metrics:', err);
    res.status(500).json({
      ok: false,
      error: 'Failed to load product metrics',
    });
  }
});
