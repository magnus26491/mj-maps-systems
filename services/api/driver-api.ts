/**
 * MJ Maps Systems — Driver API Router (Fastify handlers)
 *
 * REST + WebSocket endpoints consumed by the driver mobile app.
 *
 * REST endpoints:
 *  POST /api/v1/routes/optimise              — optimise + auto-enrich a new route
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
import { buildRouteIntelligence, type StopIntelligenceInput } from '../property-engine/stop-intelligence';
import { processDriverEvent, createSession, getSession, type DriverEvent } from '../route-engine/dynamic-replan';
import { runRoutingPipeline } from '../routing/provider.js';
import {
  buildAlertEvents,
  getRedEvents,
  summariseAlerts,
  type EnrichedStopInput,
} from '../turn-engine/src/alert-dispatcher';
import {
  enrichRouteBackground,
  generateRouteId,
} from '../turn-engine/src/enrichment-pipeline';
import { triggerEtaNotifications } from '../notifications/eta-notifier.js';
import { getAccessBrief } from '../db/failed-store.js';
import { enrichStopDoorPins } from '../geocoding/stop-intake.js';
import { scoreShiftWorkload, type WorkloadInput } from '../workload/shift-load-scorer.js';
import {
  triggerFcmDeliveredPush,
  triggerFcmFailedPush,
  triggerFcmDispatcherFailedAlert,
} from '../notifications/fcm-push.js';

// ─── IN-MEMORY ENRICHED ROUTE STORE ──────────────────────────────────────────
// Holds the most recent EnrichedStopInput[] per routeId.
// In production this would be a Redis hash keyed by routeId with a TTL
// matching the shift length (~12h). For the initial Railway deployment,
// in-memory is sufficient for single-instance operation.

const enrichedRouteStore = new Map<string, { stops: EnrichedStopInput[]; storedAt: number }>();

export function setEnrichedRoute(routeId: string, stops: EnrichedStopInput[]): void {
  enrichedRouteStore.set(routeId, { stops, storedAt: Date.now() });
}

export function getEnrichedRoute(routeId: string): EnrichedStopInput[] | null {
  const entry = enrichedRouteStore.get(routeId);
  if (!entry) return null;
  // Evict if older than 14 hours (shift + 2h margin)
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
 *
 * Flow:
 *  1. optimiseRoute()             — order stops, check time windows (sync)
 *  2. reply.send()                — return result to client immediately (~10ms)
 *  3. enrichRouteBackground()     — enrich in background (OSM calls, ~2-8s)
 *
 * The client receives routeId in the response and can poll
 * GET /routes/:routeId/alerts once enrichment completes (~3-10s later).
 * A future enhancement will push enrichment-complete via WebSocket.
 */
export async function handleOptimiseRoute(
  request: FastifyRequest & { driver?: { id?: string } },
  reply: FastifyReply,
): Promise<void> {
  const t0 = Date.now();
  try {
    const { stops, config } = request.body as { stops: Stop[]; config: RouteConfig };
    const driverId: string = (request as any).driver?.id ?? 'unknown';

    if (!Array.isArray(stops) || stops.length === 0 || !config) {
      reply.code(400).send(fail('Missing or empty stops, or missing config', t0));
      return;
    }

    // 1. Optimise stop order
    // Try the external routing pipeline (OSRM + OR-Tools + Valhalla).
    // Falls back per-step when env URLs are unset so behaviour is identical
    // to pre-Stage-2 when no engines are configured.
    let routingTimings: { matrixMs: number; solveMs: number; maneuverMs: number; totalMs: number } | undefined;
    let routingManeuvers: unknown | undefined;
    let routingSources: { matrix: string; solver: string; maneuvers: string } | undefined;

    const OSRM_URL = process.env.OSRM_URL;
    const ROUTE_SOLVER_URL = process.env.ROUTE_SOLVER_URL;
    const useExternalPipeline = !!(OSRM_URL || ROUTE_SOLVER_URL);

    let result = await optimiseRoute(stops, config);

    if (useExternalPipeline) {
      try {
        const pipelineInput = {
          depot: { lat: config.depotLat, lng: config.depotLng },
          stops: stops.map(s => ({
            id: s.id,
            lat: s.lat,
            lng: s.lng,
            serviceSeconds: (s as any).serviceMinutes ? (s as any).serviceMinutes * 60 : 300,
            timeWindowOpen: s.timeWindow?.earliestEpoch,
            timeWindowClose: s.timeWindow?.latestEpoch,
            priority: (s as any).priority ?? 0,
          })),
          vehicleConstraints: {
            vehicleId: config.vehicleId,
            heightM: config.vehicleHeightM,
            widthM: undefined,
            lengthM: config.vehicleLengthM,
            weightKg: config.vehicleGvwKg,
          },
          shiftStartEpoch: config.shiftStartEpoch,
          departAt: config.shiftStartEpoch ? new Date(config.shiftStartEpoch * 1000) : new Date(),
        };

        const pipelineResult = await runRoutingPipeline(pipelineInput);
        routingTimings = pipelineResult.timings;
        routingManeuvers = pipelineResult.maneuvers;
        routingSources = pipelineResult.sources;

        // Re-order the TS result's orderedStops to match the pipeline sequence
        if (pipelineResult.orderedIds.length === stops.length) {
          const stopMap = new Map(result.orderedStops.map(s => [s.id, s]));
          const reordered = pipelineResult.orderedIds
            .map(id => stopMap.get(id))
            .filter((s): s is Stop => s !== undefined);
          if (reordered.length === result.orderedStops.length) {
            result = { ...result, orderedStops: reordered };
          }
        }
      } catch (pipelineErr) {
        console.warn('[routing] Pipeline failed, using TS-only result:', (pipelineErr as Error).message);
      }
    }

    // 2. Generate a stable routeId for this run
    const routeId = generateRouteId(
      config.vehicleId,
      config.depotLat,
      config.depotLng,
    );

    // 3. Create live session for dynamic replanning
    createSession(routeId, 'driver', stops, config);

    // 4. Return result to client immediately — don't wait for enrichment
    reply.send(ok({
      routeId,
      ...result,
      ...(routingTimings ? { durationMs: routingTimings } : {}),
      ...(routingManeuvers ? { maneuvers: routingManeuvers } : {}),
      ...(routingSources ? { routingSources } : {}),
    }, t0));

    // 4b. Workload guard (fire-and-forget, runs after reply is sent)
    (async () => {
      try {
        // Build WorkloadInput from the ordered stops.
        // Use available fields; unknown fields default to base WUC of 1.0.
        const workloadInputs: WorkloadInput[] = result.orderedStops.map(s => ({
          stopId:            s.id,
          flightsOfStairs:  (s as any).flightsOfStairs ?? 0,
          isOversize:        (s as any).isOversize ?? false,
          requiresSignature: (s as any).requiresSignature ?? false,
          walkDistanceM:     (s as any).walkDistanceM ?? 30,
          parcelCount:       (s as any).parcelCount ?? 1,
          weight_kg:         (s as any).weight_kg ?? 0,
        }));

        const workload = scoreShiftWorkload(workloadInputs);

        // Classify severity
        const severity =
          workload.totalWuc >= 180 ? 'overload' :
          workload.totalWuc >= 150 ? 'critical' :
          workload.totalWuc >= 120 ? 'high' : 'ok';

        if (severity === 'ok') return; // no action needed

        // HIGH/CRITICAL/OVERLOAD — log workload alert
        console.warn(
          `[workload] Route ${routeId} severity=${severity} ` +
          `wuc=${workload.totalWuc} safeStops=${workload.safeStopCount}/${workloadInputs.length}`
        );

        // OVERLOAD only — fire Telegram alert to dispatcher
        if (severity === 'overload') {
          const { sendWorkloadOverloadAlert } = await import('../notifications/telegram-alerts.js');
          sendWorkloadOverloadAlert({
            routeId,
            vehicleId:     config.vehicleId,
            totalWuc:      workload.totalWuc,
            totalStops:    workloadInputs.length,
            safeStopCount: workload.safeStopCount,
            recommendations: workload.recommendations,
          }).catch(err => console.warn('[workload] Telegram alert failed:', err));
        }
      } catch (err) {
        console.warn('[workload] scoreShiftWorkload failed (non-fatal):', err);
      }
    })();

    // 5. Enrich in background (fire-and-forget, never throws to HTTP layer)
    enrichRouteBackground(result.orderedStops, config.vehicleId, routeId);

    // 6. Geocode door pins in background (fire-and-forget)
    enrichStopDoorPins(stops).catch(err =>
      console.warn('[geocoding] enrichStopDoorPins failed (non-fatal):', (err as Error).message),
    );

    // 7. Bridge restriction pre-departure check (fire-and-forget)
    //    Broadcasts VEHICLE_MISMATCH to driver's HUD via WebSocket if any stop has RED alerts.
    (async () => {
      try {
        const { fetchRestrictionsForSegment } = await import('../bridge-engine/src/osm-restrictions.js');
        const { VEHICLE_PROFILES: VP } = await import('../../packages/vehicle-profiles/index.js');
        const profile = VP[config.vehicleId];
        if (!profile) return;

        for (const stop of result.orderedStops) {
          const bridges = await fetchRestrictionsForSegment(stop.lat, stop.lng, profile);
          const redAlerts = bridges.filter(b => b.alert.level === 'red');
          if (redAlerts.length > 0) {
            broadcastToDriver(driverId, {
              type:      'VEHICLE_MISMATCH_ALERT',
              routeId,
              stopId:    stop.id,
              stopAddr:  (stop as any).notes ?? stop.id,
              vehicleId: config.vehicleId,
              message:   redAlerts.map(b => b.alert.message).join('; '),
              ts:        Date.now(),
            });
          }
        }
      } catch {
        // bridge pre-check is always non-fatal
      }
    })();
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
      stopId:      s.id,
      lat:         s.lat,
      lng:         s.lng,
      rawAddress:  (s as any).notes ?? '',
      vehicleId,
      parcel: { count: 1, totalWeightKg: 2, isOversize: false, requiresSignature: false },
      roadApproach: null,
      isApartment:  ((s as any).notes ?? '').toLowerCase().includes('flat') ||
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

    // Fire-and-forget: send customer ETA SMS after DB write completes.
    // Never awaited — failures are logged internally and never surface to client.
    if (event.routeId && event.stopId) {
      triggerEtaNotifications(event.routeId, event.stopId).catch(err => {
        request.log.warn({ err }, '[driver-api] triggerEtaNotifications failed');
      });
    }

    // FCM push for STOP_COMPLETED (delivered)
    if (event.type === 'STOP_COMPLETED' && event.stopId) {
      (async () => {
        try {
          const { pool } = await import('../db/index.js');
          const { rows } = await pool.query<{
            address: string;
            fcm_customer_token: string | null;
          }>(
            `SELECT address, fcm_customer_token FROM stops WHERE id = $1`,
            [event.stopId],
          );
          if (rows?.[0]) {
            await triggerFcmDeliveredPush(
              event.stopId,
              rows[0].address,
              null, // proofUrl — POD photo URL if available; pass null for now
              rows[0].fcm_customer_token,
            );
          }
        } catch { /* non-fatal */ }
      })();
    }

    // FCM push for STOP_FAILED (customer + dispatcher)
    if (event.type === 'STOP_FAILED' && event.stopId) {
      (async () => {
        try {
          const { pool } = await import('../db/index.js');
          const { rows } = await pool.query<{
            address: string;
            fcm_customer_token: string | null;
            failure_code: string;
            access_notes: string | null;
            driver_name: string | null;
            stop_ref: string | null;
          }>(
            `SELECT s.address, s.fcm_customer_token,
                    s.failure_code, s.access_notes,
                    d.name AS driver_name,
                    s.stop_ref
             FROM stops s
             LEFT JOIN drivers d ON d.id = $2
             WHERE s.id = $1`,
            [event.stopId, event.driverId ?? null],
          );
          if (rows?.[0]) {
            const { address, fcm_customer_token, failure_code,
                    access_notes, driver_name, stop_ref } = rows[0];
            // Customer push
            await triggerFcmFailedPush(
              event.stopId, address, failure_code, access_notes, fcm_customer_token,
            );
            // Dispatcher push
            await triggerFcmDispatcherFailedAlert(
              event.stopId, event.routeId ?? '',
              driver_name ?? 'Driver', stop_ref ?? event.stopId,
              failure_code,
            );
          }
        } catch { /* non-fatal */ }
      })();
    }
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

// ─── ALERT ENDPOINTS ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/routes/:routeId/alerts
 *
 * Full pre-departure alert list. Driver app calls this once after optimisation
 * to build its nav overlay. Background enrichment will have completed by then
 * in the normal 3-10s window between optimise and driver departure.
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
      'Enrichment may still be running — retry in a few seconds.',
      t0,
    ));
    return;
  }

  try {
    const events    = buildAlertEvents(stops);
    const summary   = summariseAlerts(stops);
    const enrichedAt = stops[0]?.osmContext?.fetchedAt ?? new Date().toISOString();

    reply.send(ok({
      routeId,
      summary: {
        blue:       summary.blue,
        amber:      summary.amber,
        red:        summary.red,
        impassable: summary.doNotEnterStops,
      },
      events,
      enrichedAt,
    }, t0));
  } catch (err) {
    reply.code(500).send(fail((err as Error).message, t0));
  }
}

/**
 * GET /api/v1/routes/:routeId/alerts/red
 *
 * Dispatcher-facing: only DO_NOT_ENTER stops before driver departs.
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
    const impassable = summary.doNotEnterStops;

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

// ─── DRIVER SOCKET MAP (for server-push messages) ─────────────────────────────
type DriverSocket = {
  send: (data: string) => void;
  on: (event: string, cb: (data: any) => void) => void;
};

const driverSockets = new Map<string, DriverSocket>();

// WS close codes — must match client ws.ts constants
const WS_CODE_UNAUTHORIZED  = 4001;
const WS_CODE_TOKEN_EXPIRED = 4008;

/**
 * Push a JSON message to a connected driver's WebSocket, if open.
 * No-op if driver is offline — caller does not need to check.
 */
export function broadcastToDriver(driverId: string, msg: Record<string, unknown>): void {
  const socket = driverSockets.get(driverId);
  if (socket) {
    try {
      socket.send(JSON.stringify(msg));
    } catch { /* ignore send errors */ }
  }
}

// ─── WEBSOCKET HANDLER ───────────────────────────────────────────────────────

export function handleDriverWebSocket(
  socket: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void; close: (code: number, reason?: string) => void },
  driverId: string,
  routeId: string,
): void {
  let authenticated = false;
  let verifiedDriverId: string | null = null;

  // Socket NOT registered yet — wait for successful AUTH first
  // This prevents broadcastToDriver() from pushing to an unauthenticated connection

  socket.on('message', async (raw: any) => {
    // ── Auth gate: first message must be AUTH ───────────────────────────────────
    if (!authenticated) {
      let msg: { type?: string; token?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.close(WS_CODE_UNAUTHORIZED, 'Invalid JSON');
        return;
      }

      if (msg.type !== 'AUTH' || !msg.token) {
        socket.close(WS_CODE_UNAUTHORIZED, 'Expected AUTH message first');
        return;
      }

      // Verify JWT from AUTH message
      try {
        const jwt = await import('jsonwebtoken');
        const payload = jwt.default.verify(
          msg.token,
          process.env.JWT_SECRET ?? 'CHANGE_ME_IN_PRODUCTION',
        ) as { sub?: string; id?: string };
        verifiedDriverId = payload.sub ?? payload.id ?? null;

        if (!verifiedDriverId) {
          socket.close(WS_CODE_UNAUTHORIZED, 'Token missing driver ID');
          return;
        }

        // Enforce driverId from JWT matches the URL param
        if (verifiedDriverId !== driverId) {
          socket.close(WS_CODE_UNAUTHORIZED, 'Token driverId mismatch');
          return;
        }

        authenticated = true;
        // Register only after auth is confirmed — prevents unauthenticated push
        driverSockets.set(driverId, socket);
        socket.send(JSON.stringify({ type: 'CONNECTED', driverId, routeId }));

        // ── Queue drain: deliver any queued dispatcher messages (Fix 3) ──
        (async () => {
          try {
            const { redis } = await import('../cache/index.js');
            const queueKey = `dispatcher:queue:${driverId}`;
            const queued = await redis.lrange(queueKey, 0, -1);
            if (queued.length > 0) {
              for (const msg of queued) {
                socket.send(msg);
                await new Promise(r => setTimeout(r, 50));
              }
              await redis.del(queueKey);
            }
          } catch {
            // Non-fatal — continue normally if Redis unavailable
          }
        })();
      } catch (err: any) {
        const code = err?.name === 'TokenExpiredError' ? WS_CODE_TOKEN_EXPIRED : WS_CODE_UNAUTHORIZED;
        socket.close(code, err?.name ?? 'Auth failed');
        return;
      }

      return; // AUTH consumed — wait for real events
    }
    // ── End auth gate ───────────────────────────────────────────────────────────

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

    // Fire-and-forget: send customer ETA SMS after DB write completes
    if (event.stopId) {
      triggerEtaNotifications(routeId, event.stopId).catch(() => {});
    }

    // FCM push for STOP_COMPLETED (delivered) — WebSocket path
    if (event.type === 'STOP_COMPLETED' && event.stopId) {
      (async () => {
        try {
          const { pool } = await import('../db/index.js');
          const { rows } = await pool.query<{
            address: string;
            fcm_customer_token: string | null;
          }>(
            `SELECT address, fcm_customer_token FROM stops WHERE id = $1`,
            [event.stopId],
          );
          if (rows?.[0]) {
            await triggerFcmDeliveredPush(
              event.stopId,
              rows[0].address,
              null,
              rows[0].fcm_customer_token,
            );
          }
        } catch { /* non-fatal */ }
      })();
    }

    // FCM push for STOP_FAILED (customer + dispatcher) — WebSocket path
    if (event.type === 'STOP_FAILED' && event.stopId) {
      (async () => {
        try {
          const { pool } = await import('../db/index.js');
          const { rows } = await pool.query<{
            address: string;
            fcm_customer_token: string | null;
            failure_code: string;
            access_notes: string | null;
            driver_name: string | null;
            stop_ref: string | null;
          }>(
            `SELECT s.address, s.fcm_customer_token,
                    s.failure_code, s.access_notes,
                    d.name AS driver_name,
                    s.stop_ref
             FROM stops s
             LEFT JOIN drivers d ON d.id = $2
             WHERE s.id = $1`,
            [event.stopId, event.driverId ?? null],
          );
          if (rows?.[0]) {
            const { address, fcm_customer_token, failure_code,
                    access_notes, driver_name, stop_ref } = rows[0];
            await triggerFcmFailedPush(
              event.stopId, address, failure_code, access_notes, fcm_customer_token,
            );
            await triggerFcmDispatcherFailedAlert(
              event.stopId, routeId,
              driver_name ?? 'Driver', stop_ref ?? event.stopId,
              failure_code,
            );
          }
        } catch { /* non-fatal */ }
      })();
    }

    // 50m approach brief — push APPROACH_BRIEF when driver is within 50m of next stop.
    // Triggered by LOCATION_UPDATE events that carry lat/lng.
    // Uses Redis to ensure each stop's brief is pushed only once.
    if (event.lat != null && event.lng != null) {
      (async () => {
        try {
          const { pool } = await import('../db/index.js');
          const { rows } = await pool.query<{
            id: string; pin_lat: number; pin_lon: number;
          }>(
            `SELECT id, pin_lat, pin_lon FROM stops
             WHERE route_id = $1 AND status = 'pending'
             ORDER BY sequence ASC LIMIT 1`,
            [routeId],
          );
          if (!rows.length || rows[0].pin_lat == null || rows[0].pin_lon == null) return;

          const nextStop = rows[0];
          // Haversine distance in metres
          const R = 6371000;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(nextStop.pin_lat - event.lat!);
          const dLon = toRad(nextStop.pin_lon - event.lng!);
          const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(toRad(event.lat!)) * Math.cos(toRad(nextStop.pin_lat)) *
                    Math.sin(dLon / 2) ** 2;
          const distM = 2 * R * Math.asin(Math.sqrt(a));

          if (distM > 50) return;

          // Dedup via Redis — only send once per stop
          const { redis } = await import('../cache/index.js');
          const key = `approach_brief_sent:${nextStop.id}`;
          const already = await redis.get(key).catch(() => null);
          if (already) return;

          const brief = await getAccessBrief(nextStop.id);
          if (!brief) return;

          socket.send(JSON.stringify({ type: 'APPROACH_BRIEF', payload: brief }));
          await redis.set(key, '1', 'EX', 86400).catch(() => {});
        } catch (err) {
          console.warn('[ws] approach brief error:', err);
        }
      })();
    }
  });

  socket.on('close', () => {
    console.log(`[ws] Driver ${driverId} disconnected from route ${routeId}`);
    driverSockets.delete(driverId);
  });
}
