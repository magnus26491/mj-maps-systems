/**
 * MJ Maps Systems — Driver API Router (Express)
 *
 * REST + WebSocket endpoints consumed by the driver mobile app.
 *
 * REST endpoints:
 *  POST /api/v1/routes/optimise          — optimise a new route
 *  GET  /api/v1/routes/:routeId/intel    — get stop intelligence for route
 *  POST /api/v1/routes/:routeId/replan   — manual replan request
 *  GET  /api/v1/stops/:stopId/intel      — get intelligence for a single stop
 *  POST /api/v1/stops/:stopId/community  — submit a community note
 *  GET  /api/v1/health                   — service health check
 *
 * WebSocket:
 *  WS /ws/driver/:driverId/:routeId      — real-time event stream
 *   ↑ client sends: DriverEvent JSON
 *   ↓ server pushes: ETAUpdate | ReplanResult JSON
 */

import type { Request, Response, NextFunction } from 'express';
import { optimiseRoute, type Stop, type RouteConfig } from '../route-engine/route-engine';
import { buildRouteIntelligence, buildStopIntelligence, type StopIntelligenceInput } from '../property-engine/stop-intelligence';
import { processDriverEvent, createSession, getSession, type DriverEvent } from '../route-engine/dynamic-replan';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

function ok<T>(data: T, t0: number): ApiResponse<T> {
  return { ok: true, data, durationMs: Date.now() - t0 };
}

function fail(error: string, t0: number): ApiResponse<never> {
  return { ok: false, error, durationMs: Date.now() - t0 };
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

export function apiErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[api]', err);
  res.status(500).json(fail(err.message, Date.now()));
}

// ─── ROUTE HANDLERS ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/routes/optimise
 * Body: { stops: Stop[], config: RouteConfig }
 */
export async function handleOptimiseRoute(req: Request, res: Response): Promise<void> {
  const t0 = Date.now();
  try {
    const { stops, config }: { stops: Stop[]; config: RouteConfig } = req.body;
    if (!Array.isArray(stops) || !config) {
      res.status(400).json(fail('Missing stops or config', t0));
      return;
    }
    const result = await optimiseRoute(stops, config);

    // Create a live session for dynamic replanning
    createSession(config.vehicleId + '-route-' + t0, 'driver', stops, config);

    res.json(ok(result, t0));
  } catch (err) {
    res.status(500).json(fail((err as Error).message, t0));
  }
}

/**
 * GET /api/v1/routes/:routeId/intel
 * Query: vehicleId, stopIds (comma-separated)
 */
export async function handleRouteIntelligence(req: Request, res: Response): Promise<void> {
  const t0 = Date.now();
  try {
    const { vehicleId } = req.query as Record<string, string>;
    const stops: Stop[] = req.body.stops ?? [];

    if (!vehicleId) {
      res.status(400).json(fail('vehicleId query param required', t0));
      return;
    }

    const inputs: StopIntelligenceInput[] = stops.map(s => ({
      stopId: s.id,
      lat: s.lat,
      lng: s.lng,
      rawAddress: s.notes ?? '',
      vehicleId,
      parcel: { count: 1, totalWeightKg: 2, isOversize: false, requiresSignature: false },
      roadApproach: null,
      isApartment: (s.notes ?? '').toLowerCase().includes('flat') ||
                   (s.notes ?? '').toLowerCase().includes('apt'),
    }));

    const intel = await buildRouteIntelligence(inputs);
    res.json(ok(Object.fromEntries(intel), t0));
  } catch (err) {
    res.status(500).json(fail((err as Error).message, t0));
  }
}

/**
 * POST /api/v1/routes/:routeId/replan
 * Body: { driverId, lat, lng, nowEpoch }
 */
export async function handleManualReplan(req: Request, res: Response): Promise<void> {
  const t0 = Date.now();
  try {
    const { driverId, lat, lng, nowEpoch } = req.body;
    const { routeId } = req.params;

    const session = getSession(driverId, routeId);
    if (!session) {
      res.status(404).json(fail(`No active session for route ${routeId}`, t0));
      return;
    }

    const result = await processDriverEvent({
      type: 'STOP_COMPLETED',
      driverId,
      routeId,
      timestampEpoch: nowEpoch ?? Math.floor(Date.now() / 1000),
      lat, lng,
    });

    res.json(ok(result, t0));
  } catch (err) {
    res.status(500).json(fail((err as Error).message, t0));
  }
}

/**
 * POST /api/v1/driver/event
 * Body: DriverEvent
 * Used as HTTP fallback when WebSocket is unavailable.
 */
export async function handleDriverEvent(req: Request, res: Response): Promise<void> {
  const t0 = Date.now();
  try {
    const event: DriverEvent = req.body;
    const result = await processDriverEvent(event);
    if (result.error) {
      res.status(400).json(fail(result.error, t0));
      return;
    }
    res.json(ok(result, t0));
  } catch (err) {
    res.status(500).json(fail((err as Error).message, t0));
  }
}

/**
 * GET /api/v1/health
 */
export function handleHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'mj-maps-systems',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// ─── WEBSOCKET HANDLER ───────────────────────────────────────────────────────

/**
 * WebSocket handler — attach to a ws.Server or uWebSockets instance.
 *
 * @example (with ws library)
 * import { WebSocketServer } from 'ws';
 * const wss = new WebSocketServer({ server: httpServer });
 * wss.on('connection', (socket, req) => {
 *   const [, , driverId, routeId] = req.url?.split('/') ?? [];
 *   handleDriverWebSocket(socket, driverId, routeId);
 * });
 */
export function handleDriverWebSocket(
  socket: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void },
  driverId: string,
  routeId: string,
): void {
  socket.send(JSON.stringify({ type: 'CONNECTED', driverId, routeId }));

  socket.on('message', async (raw: any) => {
    let event: DriverEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'ERROR', error: 'Invalid JSON' }));
      return;
    }

    const result = await processDriverEvent({ ...event, driverId, routeId });

    if (result.error) {
      socket.send(JSON.stringify({ type: 'ERROR', error: result.error }));
      return;
    }

    if (result.replan) {
      socket.send(JSON.stringify({ type: 'REPLAN', payload: result.replan }));
    }
    if (result.eta) {
      socket.send(JSON.stringify({ type: 'ETA_UPDATE', payload: result.eta }));
    }
  });

  socket.on('close', () => {
    console.log(`[ws] Driver ${driverId} disconnected from route ${routeId}`);
  });
}
