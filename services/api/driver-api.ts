/**
 * MJ Maps Systems — Driver API Router (Fastify handlers)
 *
 * REST + WebSocket endpoints consumed by the driver mobile app.
 *
 * REST endpoints:
 *  POST /api/v1/routes/optimise              — optimise a new route
 *  GET  /api/v1/routes/:routeId/intel        — stop intelligence for route
 *  POST /api/v1/routes/:routeId/replan       — manual replan request
 *  GET  /api/v1/routes/:routeId/alerts       — pre-departure alert list (all)
 *  GET  /api/v1/routes/:routeId/alerts/red   — only DO_NOT_ENTER stops (dispatcher check)
 *  POST /api/v1/driver/event                 — HTTP fallback for driver events
 *  GET  /api/v1/health                       — service health check
 *
 * WebSocket:
 *  WS /ws/driver/:driverId/:routeId          — real-time event stream
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { optimiseRoute, type Stop, type RouteConfig } from '../route-engine/route-engine';
import { buildRouteIntelligence, buildStopIntelligence, type StopIntelligenceInput } from '../property-engine/stop-intelligence';
import { processDriverEvent, createSession, getSession, type DriverEvent } from '../route-engine/dynamic-replan';
import {
  buildAlertEvents,
  getRedEvents,
  summariseAlerts,
  type EnrichedStop,
} from '../alert-dispatcher/alert-dispatcher';

// ─── IN-MEMORY ENRICHED ROUTE STORE ──────────────────────────────────────────
// Holds the most recent EnrichedStop[] per routeId.
// In production this would be a Redis hash keyed by routeId with a TTL matching
// the shift length (~12h). For the initial Railway deployment, in-memory is
// sufficient for single-instance operation and avoids a Redis dep on day one.

const enrichedRouteStore = new Map<string, { stops: EnrichedStop[]; storedAt: number }>();

export function setEnrichedRoute(routeId: string, stops: EnrichedStop[]): void {
  enrichedRouteStore.set(routeId, { stops, storedAt: Date.now() });
}

export function getEnrichedRoute(routeId: string): EnrichedStop[] | null {
  const entry = enrichedRouteStore.get(routeId);
  if (!entry) return null;
  // Evict if older than 14 hours (shift + margin)
  if (Date.now() - entry.storedAt > 14 * 60 * 60 * 1000) {
    enrichedRouteStore.delete(routeId);
    return null;
  }
  return entry.stops;
}

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────

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

// ─── ROUTE HANDLERS ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/routes/optimise
 * Body: { stops: Stop[], config: RouteConfig }
 */
export async function handleOptimiseRoute(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  try {
    const { stops, config } = request.body as { stops: Stop[]; config: RouteConfig };
    if (!Array.isArray(stops) || stops.length === 0 || !config) {
      reply.code(400).send(fail('Missing or empty stops, or missing config', t0));
      return;
    }
    const result = await optimiseRoute(stops, config);
    createSession(config.vehicleId + '-route-' + t0, 'driver', stops, config);
    reply.send(ok(result, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

/**
 * GET /api/v1/routes/:routeId/intel
 * Query: vehicleId
 * Body:  { stops: Stop[] }
 */
export async function handleRouteIntelligence(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  try {
    const { vehicleId } = request.query as Record<string, string>;
    const stops: Stop[] = (request.body as any)?.stops ?? [];

    if (!vehicleId) {
      reply.code(400).send(fail('vehicleId query param required', t0));
      return;
    }

    const inputs: StopIntelligenceInput[] = stops.map(s => ({
      stopId:   s.id,
      lat:      s.lat,
      lng:      s.lng,
      rawAddress: (s as any).notes ?? '',
      vehicleId,
      parcel: { count: 1, totalWeightKg: 2, isOversize: false, requiresSignature: false },
      roadApproach: null,
      isApartment: ((s as any).notes ?? '').toLowerCase().includes('flat') ||
                   ((s as any).notes ?? '').toLowerCase().includes('apt'),
    }));

    const intel = await buildRouteIntelligence(inputs);
    reply.send(ok(Object.fromEntries(intel), t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

/**
 * POST /api/v1/routes/:routeId/replan
 * Body: { driverId, lat, lng, nowEpoch }
 */
export async function handleManualReplan(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  try {
    const { driverId, lat, lng, nowEpoch } = request.body as any;
    const { routeId } = request.params as { routeId: string };

    const session = getSession(driverId, routeId);
    if (!session) {
      reply.code(404).send(fail(`No active session for route ${routeId}`, t0));
      return;
    }

    const result = await processDriverEvent({
      type:           'STOP_COMPLETED',
      driverId,
      routeId,
      timestampEpoch: nowEpoch ?? Math.floor(Date.now() / 1000),
      lat,
      lng,
    });

    reply.send(ok(result, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

/**
 * POST /api/v1/driver/event
 * Body: DriverEvent
 * HTTP fallback when WebSocket is unavailable (e.g. tunnel / poor signal).
 */
export async function handleDriverEvent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  try {
    const event: DriverEvent = request.body as DriverEvent;
    const result = await processDriverEvent(event);
    if (result.error) {
      reply.code(400).send(fail(result.error, t0));
      return;
    }
    reply.send(ok(result, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

// ─── ALERT ENDPOINTS ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/routes/:routeId/alerts
 *
 * Returns the full pre-departure alert list for a route.
 * The driver app calls this once after optimisation to build its nav overlay.
 *
 * Response shape:
 * {
 *   ok: true,
 *   data: {
 *     routeId: string,
 *     summary: { blue: number, amber: number, red: number, impassable: string[] },
 *     events:  AlertEvent[],
 *     enrichedAt: number,   // epoch ms of when enrichment ran
 *   },
 *   durationMs: number
 * }
 */
export async function handleRouteAlerts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  const { routeId } = request.params as { routeId: string };

  const stops = getEnrichedRoute(routeId);
  if (!stops) {
    reply.code(404).send(fail(
      `No enriched route found for routeId: ${routeId}. ` +
      'Run POST /api/v1/routes/optimise first, then enrich via the turn-engine.',
      t0,
    ));
    return;
  }

  try {
    const events   = buildAlertEvents(stops);
    const summary  = summariseAlerts(stops);
    // Surface the enrichedAt from the first stop (all stops share same enrichment pass)
    const enrichedAt = stops[0]?.enrichedAt ?? Date.now();

    reply.send(ok({ routeId, summary, events, enrichedAt }, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

/**
 * GET /api/v1/routes/:routeId/alerts/red
 *
 * Returns only DO_NOT_ENTER stops — used by the dispatcher console to
 * flag routes that contain vehicle-impassable stops before the driver departs.
 *
 * Response shape:
 * {
 *   ok: true,
 *   data: {
 *     routeId:    string,
 *     redCount:   number,
 *     impassable: string[],   // human-readable addresses
 *     events:     AlertEvent[],
 *   },
 *   durationMs: number
 * }
 */
export async function handleRouteAlertsRed(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  const { routeId } = request.params as { routeId: string };

  const stops = getEnrichedRoute(routeId);
  if (!stops) {
    reply.code(404).send(fail(
      `No enriched route found for routeId: ${routeId}.`,
      t0,
    ));
    return;
  }

  try {
    const events     = getRedEvents(stops);
    const summary    = summariseAlerts(stops);
    const impassable = summary.impassable;

    reply.send(ok({ routeId, redCount: events.length, impassable, events }, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────

export function handleHealth(_request: FastifyRequest, reply: FastifyReply): void {
  reply.send({
    ok:        true,
    status:    'ok',
    service:   'mj-maps-systems',
    version:   '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// ─── WEBSOCKET HANDLER ───────────────────────────────────────────────────────

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
