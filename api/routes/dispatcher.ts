/**
 * Dispatcher API routes
 * ---------------------
 * GET  /api/dispatcher/routes          — all active routes with driver positions
 * GET  /api/dispatcher/routes/:id      — single route detail
 * GET  /api/dispatcher/stats           — fleet KPI stats
 * GET  /api/dispatcher/alerts          — recent alerts (polling fallback)
 * GET  /api/dispatcher/alerts/stream   — SSE stream for live alerts
 * POST /api/dispatcher/alerts/:id/dismiss
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';
import { redis } from '../../services/cache';

export const dispatcherRouter = Router();

// In-memory SSE client list (swap for Redis pub/sub in multi-instance deploy)
type SseClient = { id: string; res: Response };
const sseClients: SseClient[] = [];

/** Call this from turn-engine / feedback service to push live alerts to dispatcher UI */
export function broadcastAlert(alert: unknown): void {
  const data = `event: alert\ndata: ${JSON.stringify(alert)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(data); } catch { /* client disconnected */ }
  }
}

// ── GET /api/dispatcher/routes ───────────────────────────────────────────────────
dispatcherRouter.get('/routes', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        r.id            AS "routeId",
        r.driver_id     AS "driverId",
        d.name          AS "driverName",
        r.vehicle_id    AS "vehicleId",
        r.status,
        r.total_stops   AS "totalStops",
        r.completed_stops AS "completedStops",
        r.failed_stops  AS "failedStops",
        r.total_distance_km AS "totalDistanceKm",
        r.estimated_completion AS "estimatedCompletion",
        r.shift_start   AS "shiftStart",
        r.raw_result    AS "rawResult"
      FROM routes r
      LEFT JOIN drivers d ON d.id = r.driver_id
      WHERE r.status = 'active'
      ORDER BY r.shift_start DESC
      LIMIT 50
    `);

    // Hydrate stops from raw_result JSONB, merge live stop statuses
    const routes = rows.map((row: Record<string, unknown>) => {
      const raw = row.rawResult as { stops?: unknown[] } | null;
      return {
        ...row,
        rawResult: undefined,
        vehicleLabel: row.vehicleId,   // TODO: map via VEHICLE_PROFILES
        currentLat: 0,                  // TODO: from GPS ping table
        currentLon: 0,
        lastPing: new Date().toISOString(),
        stops: raw?.stops ?? [],
      };
    });

    res.json({ routes });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/dispatcher/routes/:id ──────────────────────────────────────────────
dispatcherRouter.get('/routes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, d.name AS "driverName"
       FROM routes r LEFT JOIN drivers d ON d.id = r.driver_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Route not found' }); return; }
    const row = rows[0];
    const raw = row.raw_result as { stops?: unknown[] } | null;
    res.json({
      route: {
        routeId: row.id,
        driverId: row.driver_id,
        driverName: row.driverName,
        vehicleId: row.vehicle_id,
        vehicleLabel: row.vehicle_id,
        status: row.status,
        totalStops: row.total_stops,
        completedStops: row.completed_stops,
        failedStops: row.failed_stops,
        totalDistanceKm: row.total_distance_km ?? 0,
        estimatedCompletion: row.estimated_completion,
        shiftStart: row.shift_start,
        currentLat: 0,
        currentLon: 0,
        lastPing: new Date().toISOString(),
        stops: raw?.stops ?? [],
      }
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/dispatcher/stats ────────────────────────────────────────────────────
dispatcherRouter.get('/stats', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeRes, stopsRes, alertsRes] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS active_routes, COUNT(DISTINCT driver_id) AS total_drivers
        FROM routes WHERE status = 'active'
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_today,
          COUNT(*) FILTER (WHERE status = 'failed')    AS failed_today,
          0 AS total_distance
        FROM stops
        WHERE created_at >= $1
      `, [today]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE turn_alert_level = 'RED'   AND status = 'pending') AS red_alerts,
          COUNT(*) FILTER (WHERE turn_alert_level = 'AMBER' AND status = 'pending') AS amber_alerts
        FROM stops
        WHERE created_at >= $1
      `, [today]),
    ]);

    res.json({
      activeRoutes:         parseInt(activeRes.rows[0].active_routes),
      totalDrivers:         parseInt(activeRes.rows[0].total_drivers),
      completedStopsToday:  parseInt(stopsRes.rows[0].completed_today),
      failedStopsToday:     parseInt(stopsRes.rows[0].failed_today),
      totalDistanceKmToday: parseFloat(stopsRes.rows[0].total_distance) || 0,
      redAlerts:            parseInt(alertsRes.rows[0].red_alerts),
      amberAlerts:          parseInt(alertsRes.rows[0].amber_alerts),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/dispatcher/alerts/stream (SSE) ─────────────────────────────────
dispatcherRouter.get('/alerts/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sseClients.push({ id: clientId, res });

  // Heartbeat every 20s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.findIndex((c) => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// ── GET /api/dispatcher/alerts (polling fallback) ──────────────────────────────
dispatcherRouter.get('/alerts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { rows } = await pool.query(`
      SELECT
        s.id          AS "alertId",
        s.route_id    AS "routeId",
        d.name        AS "driverName",
        r.vehicle_id  AS "vehicleLabel",
        s.turn_alert_level AS "level",
        s.address     AS "stopAddress",
        '' AS instruction,
        s.turn_score::FLOAT * 10 AS "roadWidthM",
        0  AS "vehicleMinTurnWidthM",
        s.created_at  AS ts,
        FALSE AS dismissed
      FROM stops s
      JOIN routes r ON r.id = s.route_id
      LEFT JOIN drivers d ON d.id = r.driver_id
      WHERE s.turn_alert_level IN ('RED','AMBER')
        AND s.status = 'pending'
      ORDER BY
        CASE s.turn_alert_level WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END,
        s.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json({ alerts: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/dispatcher/alerts/:id/dismiss ──────────────────────────────────
dispatcherRouter.post('/alerts/:id/dismiss', async (req, res) => {
  // Mark stop as acknowledged — just note in Redis to avoid re-surfacing
  await redis.setex(`dismissed:${req.params.id}`, 60 * 60 * 4, '1');
  res.json({ success: true });
});
