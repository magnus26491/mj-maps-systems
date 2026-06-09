/**
 * Dispatcher API routes
 * ---------------------
 * GET  /api/dispatcher/routes          — all active routes with driver positions
 * GET  /api/dispatcher/routes/:id      — single route detail
 * GET  /api/dispatcher/stats           — fleet KPI stats
 * GET  /api/dispatcher/alerts          — recent alerts (polling fallback)
 * GET  /api/dispatcher/alerts/stream   — SSE stream for live alerts
 * POST /api/dispatcher/alerts/:id/dismiss
 * GET  /api/dispatcher/stops/:stopId/pod — POD photo for a stop (enterprise-gated)
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';
import { redis, createSubscriber } from '../../services/cache';
import { verifyAccessToken } from '../../services/auth';
import { requireEnterprise } from '../middleware/requireEnterprise';
import { maybeCompleteRoute } from '../../services/route-completion';

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

    // Batch read live locations from Redis
    const locMap = new Map<string, { lat: number; lng: number; heading: number | null; recordedAt: string }>();
    if (rows.length > 0) {
      const driverIdEntries = rows
        .map((r: Record<string, unknown>, idx: number) => ({ driverId: r.driverId as string | null, idx }))
        .filter((e): e is { driverId: string; idx: number } => Boolean(e.driverId));

      const keys = driverIdEntries.map(e => `driver:loc:${e.driverId}`);

      try {
        const values = await redis.mget(...keys);
        for (let i = 0; i < driverIdEntries.length; i++) {
          const val = values[i];
          if (val) {
            try {
              const loc = JSON.parse(val) as { lat: number; lng: number; heading?: number | null; speedKmh?: number | null; routeId?: string | null; recordedAt: string };
              locMap.set(driverIdEntries[i]!.driverId, { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, recordedAt: loc.recordedAt });
            } catch { /* skip malformed JSON */ }
          }
        }
      } catch (err) {
        console.warn('[dispatcher] Redis mget failed, falling back to 0,0:', err);
      }
    }

    // Hydrate stops from raw_result JSONB, merge live GPS positions
    const routes = rows.map((row: Record<string, unknown>) => {
      const raw = row.rawResult as { stops?: unknown[] } | null;
      const loc = locMap.get(row.driverId as string);
      return {
        ...row,
        rawResult: undefined,
        vehicleLabel: row.vehicleId,
        currentLat: loc?.lat ?? 0,
        currentLon: loc?.lng ?? 0,
        lastPing: loc?.recordedAt ?? null,
        heading: loc?.heading ?? null,
        stops: raw?.stops ?? [],
      };
    });

    res.json({ routes });
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
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
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
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
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── GET /api/dispatcher/locations/stream (SSE) ───────────────────────────────
dispatcherRouter.get('/locations/stream', (req, res) => {
  // Auth via query param (EventSource cannot send Authorization headers)
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).end(); return; }
  const payload = verifyAccessToken(token);
  if (!payload) { res.status(401).end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial snapshot: all current driver locations from Redis
  (async () => {
    try {
      const keys = await redis.keys('driver:loc:*');
      if (keys.length > 0) {
        const values = await redis.mget(...keys);
        const snapshot = values
          .map((v, i) => {
            if (!v) return null;
            try {
              const loc = JSON.parse(v) as { driverId: string; lat: number; lng: number; heading?: number | null; speedKmh?: number | null; routeId?: string | null; recordedAt: string };
              // Redis key is driver:loc:{id}; extract id from key
              const driverId = keys[i]!.replace('driver:loc:', '');
              return { ...loc, driverId };
            } catch { return null; }
          })
          .filter(Boolean);
        res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      }
    } catch (err) {
      console.warn('[locations/stream] snapshot fetch failed:', err);
    }

    // Subscribe to live updates
    const subscriber = createSubscriber();
    subscriber.subscribe('fleet:locations', (err) => {
      if (err) { console.warn('[locations/stream] subscribe failed:', err); return; }
      subscriber.on('message', (_channel, message) => {
        try { res.write(`event: location\ndata: ${message}\n\n`); }
        catch { /* client disconnected */ }
      });
    });

    req.on('close', () => { subscriber.quit(); });
  })();
});

// ── GET /api/dispatcher/alerts/stream (SSE) ─────────────────────────────────
dispatcherRouter.get('/alerts/stream', (req, res) => {
  // Auth via query param (EventSource cannot send Authorization headers)
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).end(); return; }
  const payload = verifyAccessToken(token);
  if (!payload) { res.status(401).end(); return; }

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
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── POST /api/dispatcher/routes/:routeId/complete ───────────────────────────
dispatcherRouter.post('/routes/:routeId/complete', async (req, res) => {
  try {
    const { routeId } = req.params;
    const completed = await maybeCompleteRoute(routeId);
    if (!completed) {
      res.status(409).json({ success: false, error: 'Route already completed or not found.' });
      return;
    }
    broadcastAlert({ type: 'route_completed', routeId, manual: true, ts: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── POST /api/dispatcher/alerts/:id/dismiss ──────────────────────────────────
dispatcherRouter.post('/alerts/:id/dismiss', async (req, res) => {
  // Mark stop as acknowledged — just note in Redis to avoid re-surfacing
  await redis.setex(`dismissed:${req.params.id}`, 60 * 60 * 4, '1');
  res.json({ success: true });
});

// ── GET /api/dispatcher/stops/:stopId/pod ───────────────────────────────────
dispatcherRouter.get('/stops/:stopId/pod', requireEnterprise, async (req: Request, res: Response) => {
  const { stopId } = req.params;

  try {
    const { rows } = await pool.query<{
      pod_url: string | null;
      pod_type: string | null;
      pod_captured_at: Date | null;
    }>(
      `SELECT pod_url, pod_type, pod_captured_at FROM stops WHERE id = $1 LIMIT 1`,
      [stopId],
    );

    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Stop not found.' });
      return;
    }

    const stop = rows[0];
    if (!stop.pod_url) {
      res.status(404).json({ success: false, error: 'No proof of delivery captured for this stop.' });
      return;
    }

    res.json({
      success: true,
      podUrl: stop.pod_url,
      podType: stop.pod_type ?? 'photo',
      podCapturedAt: stop.pod_captured_at?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('[dispatcher]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});
